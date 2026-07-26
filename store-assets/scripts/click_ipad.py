#!/usr/bin/env python3
"""Click a fractional point on the iPad Simulator device screen."""
import sys
import time
import subprocess
import Quartz

FX, FY = float(sys.argv[1]), float(sys.argv[2])

windows = Quartz.CGWindowListCopyWindowInfo(
    Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements,
    Quartz.kCGNullWindowID,
)
cands = [
    w.get("kCGWindowBounds")
    for w in windows
    if "Simulator" in (w.get("kCGWindowOwnerName") or "")
]
if not cands:
    raise SystemExit("no simulator window")


def score(b):
    w = b.get("Width", 1)
    h = b.get("Height", 1)
    return -abs((w / h) - 0.75) + (w * h) / 1e6


b = max(cands, key=score)
l, t, w, h = int(b["X"]), int(b["Y"]), int(b["Width"]), int(b["Height"])
aspect = 2064 / 2752
toolbar = 52
avail_h = h - toolbar - 8
avail_w = w - 16
if avail_w / max(avail_h, 1) > aspect:
    dh = avail_h
    dw = int(dh * aspect)
else:
    dw = avail_w
    dh = int(dw / aspect)
dx = l + (w - dw) // 2
dy = t + toolbar + (avail_h - dh) // 2
x = dx + int(dw * FX)
y = dy + int(dh * FY)

subprocess.run(["osascript", "-e", 'tell application "Simulator" to activate'], check=False)
time.sleep(0.15)
for ev in (
    Quartz.kCGEventMouseMoved,
    Quartz.kCGEventLeftMouseDown,
    Quartz.kCGEventLeftMouseUp,
):
    Quartz.CGEventPost(
        Quartz.kCGHIDEventTap,
        Quartz.CGEventCreateMouseEvent(None, ev, (x, y), Quartz.kCGMouseButtonLeft),
    )
    time.sleep(0.04)
print(f"clicked {FX},{FY} -> {x},{y}")
