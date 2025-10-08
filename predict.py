#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
predict.py — загрузка finetuned_model.pth и предсказание по фото(ам).
Выход: JSON в stdout + человекочитаемый вывод.
"""

import argparse, json, sys
from pathlib import Path
from PIL import Image
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models, transforms

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD  = [0.229, 0.224, 0.225]

def load_card(card_path: Path):
    if card_path.exists():
        with open(card_path, "r", encoding="utf-8") as f:
            card = json.load(f)
        c2i = card.get("class_to_idx")
        # ключи могли быть строками — приводим ключи к str, а значения к int
        class_to_idx = {str(k): int(v) for k, v in c2i.items()}
        input_size = card.get("transforms", {}).get("input_size", [3, 256, 256])
    else:
        # Фоллбэк: ожидаемые классы в нужном порядке
        class_to_idx = {"отлично":0,"хорошо":1,"неплохо":2,"плохо":3,"отход":4}
        input_size = [3, 256, 256]
    idx_to_class = {v:k for k,v in class_to_idx.items()}
    return class_to_idx, idx_to_class, input_size

def build_model(num_classes: int, device: torch.device):
    try:
        weights = models.ResNet50_Weights.DEFAULT
        model = models.resnet50(weights=weights)
    except Exception:
        model = models.resnet50(pretrained=True)
    in_feats = model.fc.in_features
    model.fc = nn.Linear(in_feats, num_classes)
    return model.to(device).eval()

def build_transform(input_size):
    # В проде используем те же нормализации/размеры, что при валидации
    H = input_size[-1] if isinstance(input_size, (list, tuple)) else 256
    return transforms.Compose([
        transforms.Resize(288),
        transforms.CenterCrop(H),
        transforms.ToTensor(),
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
    ])

@torch.no_grad()
def predict_one(model, tfm, img_path, device, idx_to_class, topk=5):
    img = Image.open(img_path).convert("RGB")
    x = tfm(img).unsqueeze(0).to(device)
    logits = model(x)
    probs = F.softmax(logits, dim=1)[0]
    k = min(topk, probs.numel())
    conf, idx = torch.topk(probs, k)
    conf = conf.detach().cpu().tolist()
    idx  = idx.detach().cpu().tolist()
    top = [{"class_idx":i, "class_name": idx_to_class[i], "prob": float(p)} for i,p in zip(idx, conf)]
    return {
        "top1": top[0],
        "topk": top
    }

def iter_images(args):
    if args.image:
        yield Path(args.image)
    elif args.dir:
        exts = {".jpg",".jpeg",".png",".bmp",".tif",".tiff",".webp"}
        for p in Path(args.dir).rglob("*"):
            if p.is_file() and p.suffix.lower() in exts:
                yield p
    else:
        raise SystemExit("Укажите --image или --dir")

def main():
        parser = argparse.ArgumentParser()
        parser.add_argument("--weights", required=True, help="Путь к .pth файлу (finetuned_model.pth)")
        parser.add_argument("--card", required=False, default="model_card.json", help="model_card.json с class_to_idx")
        parser.add_argument("--image", help="Путь к одному изображению")
        parser.add_argument("--dir", help="Папка с изображениями (рекурсивно)")
        parser.add_argument("--device", default="auto", choices=["auto","cpu","cuda"])
        parser.add_argument("--topk", type=int, default=5)
        args = parser.parse_args()

        device = torch.device("cuda" if (args.device=="auto" and torch.cuda.is_available()) else args.device)
        class_to_idx, idx_to_class, input_size = load_card(Path(args.card))
        model = build_model(num_classes=len(class_to_idx), device=device)

        # грузим веса
        state = torch.load(args.weights, map_location=device)
        model.load_state_dict(state, strict=True)
        model.eval()

        tfm = build_transform(input_size)

        results = []
        for img_path in iter_images(args):
            try:
                res = predict_one(model, tfm, img_path, device, idx_to_class, topk=args.topk)
                printable = f"{img_path.name}: {res['top1']['class_name']} (p={res['top1']['prob']:.3f})"
                print(printable)
                results.append({"image": str(img_path), **res})
            except Exception as e:
                print(f"{img_path}: ERROR: {e}", file=sys.stderr)

        # JSON для машинной интеграции
        print(json.dumps({"results": results}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
