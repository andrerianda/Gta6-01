"""The photograph on the office wall: a 30 x 40 cm timber frame with glass over a faded colour
print of a young pilot in an olive flight suit, helmet under his arm, by the nose of a jet at
golden hour (painted in paint.pilot_photo; no real insignia). Origin at the centre of the back,
the picture faces the asset's front (+Y here, the game's -Z).
"""
import _story_kit as kit
import paint
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'framed_pilot_photo', 'atlas': 1024, 'kind': 'prop', 'views': ((12, 6, 1.15),), 'ground': False}
W, H, BAR, DEPTH = 0.30, 0.40, 0.03, 0.026


def make(a, work_dir):
    timber = kit.wood('frame_wood', '#4a2f1c', 'X', 0.4, 0.35)
    upright = kit.wood('frame_wood_upright', '#4a2f1c', 'Z', 0.4, 0.35)
    board = sf.coated('backboard', '#6b5536', 0.85, 0.0, 0.5)
    bars = [kit.block('bar_top', (W, DEPTH, BAR), (0, DEPTH / 2, H / 2 - BAR / 2), timber, 0.006),
            kit.block('bar_bottom', (W, DEPTH, BAR), (0, DEPTH / 2, -H / 2 + BAR / 2), timber, 0.006),
            kit.block('bar_l', (BAR, DEPTH, H - 2 * BAR + 0.004), (-W / 2 + BAR / 2, DEPTH / 2, 0), upright, 0.006),
            kit.block('bar_r', (BAR, DEPTH, H - 2 * BAR + 0.004), (W / 2 - BAR / 2, DEPTH / 2, 0), upright, 0.006)]
    inner = [kit.block('lip', (W - 2 * BAR + 0.004, 0.004, 0.006), (0, 0.018, sz * (H / 2 - BAR - 0.002)), sf.plain('gilt_lip', '#8a6a34', 0.4, 0.8)) for sz in (-1, 1)]
    a.add_all(bars + inner, 0.8)
    pw, ph = 0.2565, 0.342
    a.add(kit.printed_panel('print', paint.pilot_photo(work_dir), (pw / 2, 0.012, -ph / 2), (-pw, 0, 0), (0, 0, ph), roughness=0.45, bump=0.0), 2.4)
    a.add(kit.block('backboard', (W - 0.01, 0.003, H - 0.01), (0, 0.0015, 0), board), 0.4)
    a.add(kit.rod('wire', [(-0.1, -0.002, 0.11), (0, -0.003, 0.15), (0.1, -0.002, 0.11)], 0.0012, sf.plain('wire', '#8c8c88', 0.4, 1.0), 4), 0.5)
    glass = kit.panel('glass_pane', (W / 2 - BAR, 0.016, -H / 2 + BAR), (-(W - 2 * BAR), 0, 0), (0, 0, H - 2 * BAR))
    mk.assign(glass, sf.glass('glass', '#c8d4d8', 0.1, 0.03))
    a.add(glass)
    a.occlusion_distance = 0.04
