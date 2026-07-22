---
title: train 与 val 同址会让 early stop 失效
date: 2026-07-22 12:09:18
description: train 与 val 同址时，early stop 会基于过拟合的验证指标失效，best/last.pt 不可信，应扫描中间轮次模型来判断真实泛化性能。
tags:
  - 深度学习
  - 模型训练
permalink: train-val-overlap-breaks-early-stop/
---

在训练模型时，如果 train 和 val 同址，会让 early stop 失效，会过拟合，这时候不要找 best.pt 或者 last.pt，需要扫中间轮次的模型来确认泛化性能的表现。
