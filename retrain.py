#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
retrain.py — продолжить тонкую подстройку ResNet50 на новых данных.
Пример:
python retrain.py --train train.csv --val val.csv --weights_in finetuned_model.pth --card model_card.json --out_dir artifacts
"""

import argparse, json, time
from pathlib import Path
from PIL import Image
import csv, numpy as np

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from torchvision import models, transforms
from sklearn.metrics import accuracy_score, f1_score

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD  = [0.229, 0.224, 0.225]

class CSVDataset(Dataset):
    def __init__(self, csv_path, transform, class_to_idx):
        self.items = list(csv.DictReader(open(csv_path, encoding="utf-8")))
        self.class_to_idx = class_to_idx
        self.transform = transform
    def __len__(self): return len(self.items)
    def __getitem__(self, i):
        row = self.items[i]
        img = Image.open(row["filepath"]).convert("RGB")
        x = self.transform(img)
        y = self.class_to_idx[row["label"]]
        return x, y

def load_card(card_path: Path):
    with open(card_path, "r", encoding="utf-8") as f:
        card = json.load(f)
    class_to_idx = {str(k): int(v) for k,v in card["class_to_idx"].items()}
    idx_to_class = {v:k for k,v in class_to_idx.items()}
    input_size = card.get("transforms", {}).get("input_size", [3,256,256])
    return class_to_idx, idx_to_class, input_size

def build_model(num_classes: int, device: torch.device):
    try:
        weights = models.ResNet50_Weights.DEFAULT
        model = models.resnet50(weights=weights)
    except Exception:
        model = models.resnet50(pretrained=True)
    in_feats = model.fc.in_features
    model.fc = nn.Linear(in_feats, num_classes)
    return model.to(device)

def freeze_all(model):
    for p in model.parameters():
        p.requires_grad = False

def unfreeze_layer4_and_head(model, train_bn=False):
    # размораживаем layer4 и голову
    for m in model.layer4.modules():
        if isinstance(m, nn.BatchNorm2d):
            for p in m.parameters():
                p.requires_grad = bool(train_bn)
        else:
            for p in m.parameters():
                p.requires_grad = True
    for p in model.fc.parameters():
        p.requires_grad = True
    return model

def make_transforms(input_size):
    H = input_size[-1]
    tf_train = transforms.Compose([
        transforms.Resize(288),
        transforms.RandomResizedCrop(H, scale=(0.85,1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.1, contrast=0.1),  # мягко
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    tf_val = transforms.Compose([
        transforms.Resize(288),
        transforms.CenterCrop(H),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    return tf_train, tf_val

@torch.no_grad()
def evaluate(model, loader, criterion=None, device="cpu"):
    model.eval()
    losses, y_true, y_pred = [], [], []
    for xb, yb in loader:
        xb, yb = xb.to(device), yb.to(device)
        logits = model(xb)
        if criterion is not None:
            losses.append(criterion(logits, yb).item())
        y_true.append(yb.cpu().numpy())
        y_pred.append(logits.argmax(1).cpu().numpy())
    y_true = np.concatenate(y_true); y_pred = np.concatenate(y_pred)
    acc = accuracy_score(y_true, y_pred)
    f1m = f1_score(y_true, y_pred, average="macro")
    loss = float(np.mean(losses)) if losses else None
    return loss, acc, f1m

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", required=True)
    ap.add_argument("--val", required=True)
    ap.add_argument("--weights_in", required=True)
    ap.add_argument("--card", required=True)
    ap.add_argument("--out_dir", default="artifacts")
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--patience", type=int, default=3)
    ap.add_argument("--bs", type=int, default=32)
    ap.add_argument("--lr_head", type=float, default=3e-4)
    ap.add_argument("--lr_l4", type=float, default=3e-5)
    ap.add_argument("--weight_decay", type=float, default=1e-4)
    ap.add_argument("--device", default="auto", choices=["auto","cpu","cuda"])
    args = ap.parse_args()

    device = torch.device("cuda" if (args.device=="auto" and torch.cuda.is_available()) else args.device)

    class_to_idx, idx_to_class, input_size = load_card(Path(args.card))
    tf_train, tf_val = make_transforms(input_size)

    ds_tr = CSVDataset(args.train, tf_train, class_to_idx)
    ds_va = CSVDataset(args.val,   tf_val,   class_to_idx)
    dl_tr = DataLoader(ds_tr, batch_size=args.bs, shuffle=True,  num_workers=4, pin_memory=True)
    dl_va = DataLoader(ds_va, batch_size=args.bs, shuffle=False, num_workers=4, pin_memory=True)

    model = build_model(len(class_to_idx), device)
    state = torch.load(args.weights_in, map_location=device)
    model.load_state_dict(state, strict=True)

    freeze_all(model)
    unfreeze_layer4_and_head(model, train_bn=False)
    model.to(device)

    # class weights (по train)
    counts = np.bincount([class_to_idx[row["label"]] for row in csv.DictReader(open(args.train, encoding="utf-8"))],
                         minlength=len(class_to_idx))
    counts[counts==0] = 1
    class_weights = (counts.sum() / (len(counts) * counts)).astype("float32")
    class_weights = torch.tensor(class_weights, device=device)

    criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=0.05)

    opt = torch.optim.AdamW([
        {"params": model.fc.parameters(),     "lr": args.lr_head},
        {"params": model.layer4.parameters(), "lr": args.lr_l4},
    ], weight_decay=args.weight_decay)

    best_f1, best_state, no_imp = -1.0, None, 0
    for epoch in range(1, args.epochs+1):
        model.train()
        run_loss, nb = 0.0, 0
        for xb, yb in dl_tr:
            xb, yb = xb.to(device), yb.to(device)
            opt.zero_grad(set_to_none=True)
            logits = model(xb)
            loss = criterion(logits, yb)
            loss.backward()
            opt.step()
            run_loss += loss.item(); nb += 1
        tr_loss = run_loss / max(1, nb)
        va_loss, va_acc, va_f1 = evaluate(model, dl_va, criterion, device)
        print(f"[{epoch:02d}] train_loss={tr_loss:.4f} | val_loss={va_loss:.4f} | val_acc={va_acc:.4f} | val_f1={va_f1:.4f}")

        if va_f1 > best_f1 + 1e-5:
            best_f1 = va_f1
            best_state = {k:v.cpu() for k,v in model.state_dict().items()}
            no_imp = 0
        else:
            no_imp += 1
            if no_imp >= args.patience:
                print(f"Early stop: {args.patience} без улучшений, best val_f1={best_f1:.4f}")
                break

    out_dir = Path(args.out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d_%H%M")
    out_path = out_dir / f"finetuned_{stamp}.pth"
    torch.save(best_state if best_state is not None else model.state_dict(), out_path)
    print(f"Сохранено: {out_path}")

if __name__ == "__main__":
    main()
