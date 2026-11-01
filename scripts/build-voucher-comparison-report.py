"""Build a local review artifact from PDF renders and real Studio screenshots.

These full voucher images are review evidence only. They are never copied to
the website's public assets or used to render an editable voucher.
"""
import argparse
import base64
import html
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "tmp" / "voucher-comparison"


def prepare_pairs():
    geometry = json.loads((WORK / "studio" / "geometry.json").read_text(encoding="utf-8"))
    (WORK / "pairs").mkdir(parents=True, exist_ok=True)
    for item in geometry:
        page = item["page"]
        source = Image.open(WORK / "pdf" / f"{page:02}.png").convert("RGB")
        capture = Image.open(WORK / "studio" / f"{page:02}-ui.png").convert("RGB")
        box = item["bounds"]
        studio = capture.crop(tuple(round(value) for value in (
            box["x"], box["y"], box["x"] + box["w"], box["y"] + box["h"])))
        studio = studio.resize(source.size, Image.Resampling.LANCZOS)
        studio.save(WORK / "studio" / f"{page:02}.png")
        pair = Image.new("RGB", (source.width * 2 + 36, source.height + 40), "#e5e9ef")
        pair.paste(source, (8, 32))
        pair.paste(studio, (source.width + 28, 32))
        draw = ImageDraw.Draw(pair)
        draw.text((10, 10), f"PAGE {page:02} - ORIGINAL PDF", fill="#17212b")
        draw.text((source.width + 28, 10), "UPDATED HTML / CSS", fill="#17212b")
        pair.save(WORK / "pairs" / f"{page:02}.jpg", quality=94, subsampling=0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    prepare_pairs()
    manifest = json.loads((ROOT / "public/voucher-assets/manifest.json").read_text(encoding="utf-8"))
    review_path = WORK / "review.json"
    review = json.loads(review_path.read_text(encoding="utf-8")) if review_path.exists() else {}
    font = base64.b64encode((ROOT / "public/fonts/kalpurush.woff2").read_bytes()).decode("ascii")
    cards = []
    options = []
    pending = []
    for page in manifest["templates"]:
        number = page["page"]
        detail = review.get(str(number), {})
        image = base64.b64encode((WORK / "pairs" / f"{number:02}.jpg").read_bytes()).decode("ascii")
        notes = "".join(f"<li>{html.escape(note)}</li>" for note in detail.get("fixed", []))
        remaining = "".join(f"<li>{html.escape(note)}</li>" for note in detail.get("remaining", []))
        if remaining:
            pending.append(f'<a href="#page-{number}">{number:02}</a>')
        check = html.escape(detail.get("checked", "শিরোনাম, যোগাযোগ, লোগো, রং, ফর্ম, টেবিল, মোট, ফুটার এবং A4-এ কপির অবস্থান পর্যালোচনা করা হয়েছে।"))
        suffix = " · নোট আছে" if remaining else ""
        options.append(f'<option value="{number}">{number:02} · {html.escape(page["name"])}{suffix}</option>')
        cards.append(f'''<article id="page-{number}" data-page="{number}" hidden>
          <h2>{number:02} · {html.escape(page["name"])}</h2>
          <p class="checked">{check}</p>
          {f'<details open><summary>সংশোধন করা হয়েছে</summary><ul>{notes}</ul></details>' if notes else ''}
          {f'<details open class="remaining"><summary>এখনও অমিল / নিশ্চিত করা যায়নি</summary><ul>{remaining}</ul></details>' if remaining else ''}
          <div class="comparison"><img alt="Page {number}: source PDF left, current HTML/CSS right, equal A4 scale" src="data:image/jpeg;base64,{image}"></div>
        </article>''')
    document = '''<!doctype html><html lang="bn"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>ভাউচার · PDF-এর সঙ্গে পাশাপাশি যাচাই</title><style>
    @font-face{font-family:Kalpurush;src:url(data:font/woff2;base64,FONT)}
    *{box-sizing:border-box}body{margin:0;background:#f1f5f7;color:#172d35;font:18px/1.5 Kalpurush,Arial,sans-serif}
    header{padding:24px 32px 16px;background:#fff;border-bottom:1px solid #ccd8df}h1{font-size:30px;margin:0 0 6px}p{margin:8px 0;max-width:1100px}
    .controls{position:sticky;top:0;z-index:3;padding:12px 32px;background:#e6eef1;display:flex;gap:12px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #bbcbd3}
    select,button{font:inherit;padding:7px 12px;border:1px solid #9fb3bd;border-radius:6px;background:#fff;color:inherit}select{min-width:320px;max-width:80vw}button{cursor:pointer}
    main{padding:12px 24px 32px}h2{margin:12px 0;font-size:25px}.checked{color:#42616c}details{margin:8px 0;padding:8px 14px;background:#fff;border:1px solid #d0dfe4;border-radius:6px}summary{cursor:pointer;font-weight:bold}ul{margin:6px 0;padding-left:25px}.remaining{border-color:#d9ae67;background:#fff8ec}
    .comparison{overflow:auto;border:1px solid #b9cbd4;border-radius:6px;margin-top:14px;background:#e5e9ef}.comparison img{display:block;width:var(--image-width,100%);max-width:none;height:auto}
    .legend{padding:10px 16px;background:#f3f7f9;border-left:4px solid #3c7c89}small{color:#52727d}
    </style><header><h1>৩০ পেজের ভাউচার: PDF বনাম HTML/CSS</h1>
    <p>বামে মূল PDF, ডানে সংশোধনের পর ব্রাউজারে দেখা সম্পাদনাযোগ্য ভাউচার। দুই পাশ একই A4 স্কেলে দেখানো হয়েছে।</p>
    <p class="legend">অনুমোদিত পার্থক্য: Kalpurush ফন্ট, “আফ্রিদা” নামের সংশোধন, পূর্বমুদ্রিত ভাউচার নম্বর ফাঁকা, হাতে লেখা দাগ/স্বাক্ষর বাদ। মূল স্ক্যানের ঝাপসা হরফ, কাগজের দাগ ও রঙের ছাপ HTML-এ হুবহু নকল করা হয়নি।</p>
    <p>স্পষ্ট লেখা ও কাঠামোর অমিল সংশোধন করা হয়েছে। অস্পষ্ট লেখা বা ছোট অবশিষ্ট ডিটেলের নোট আছে এই পেজগুলোতে: PENDING।</p>
    <small>পৃষ্ঠা ধরে লেখা, ফোন, ঠিকানা, শর্ত, লোগো, জলছাপ, টেবিলের ঘর, মোট, স্বাক্ষর, রং ও অবস্থান পরীক্ষা করা হয়েছে। নিচের নোটে অনিশ্চিত বা বাকি পার্থক্য আলাদা আছে। এই তুলনার ছবিগুলো ওয়েবসাইটের ভাউচার রেন্ডারার নয়।</small>
    </header><nav class="controls"><button id="previous">← আগের</button><select id="page" aria-label="PDF পেজ">OPTIONS</select><button id="next">পরের →</button><label>বড় করে দেখুন <input id="zoom" aria-label="Zoom" type="range" min="100" max="250" step="25" value="100"></label><span id="scale">100%</span></nav>
    <main>CARDS</main><script>
    const page=document.getElementById('page'),zoom=document.getElementById('zoom');
    function show(value){value=Math.max(1,Math.min(30,Number(value)));page.value=value;document.querySelectorAll('article').forEach(el=>el.hidden=el.dataset.page!=value);history.replaceState(null,'','#page-'+value)}
    page.addEventListener('change',()=>show(page.value));document.getElementById('previous').onclick=()=>show(Number(page.value)-1);document.getElementById('next').onclick=()=>show(Number(page.value)+1);
    zoom.oninput=()=>{document.documentElement.style.setProperty('--image-width',zoom.value+'%');document.getElementById('scale').textContent=zoom.value+'%'};addEventListener('hashchange',()=>show(location.hash.replace('#page-','')||1));show(location.hash.replace('#page-','')||1);
    </script></html>'''.replace("FONT", font).replace("OPTIONS", "".join(options)).replace("CARDS", "\n".join(cards)).replace("PENDING", ", ".join(pending))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(document, encoding="utf-8")
    print(f"Created 30-page comparison: {args.output} ({args.output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
