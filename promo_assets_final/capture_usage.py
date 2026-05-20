import os
import asyncio
from playwright.async_api import async_playwright
from PIL import Image

async def main():
    html_path = os.path.abspath('screenshots_ready/usage_promo.html')
    output_png = 'screenshots_ready/usage_promo_1280x800.png'
    output_jpg = 'screenshots_ready/usage_promo_1280x800.jpg'
    
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})
        await page.goto(f'file:///{html_path}')
        await page.wait_for_timeout(1000)
        await page.screenshot(path=output_png, full_page=False)
        await browser.close()
        print(f"Captured initial screenshot to {output_png}")

    img = Image.open(output_png)
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        background = Image.new('RGB', img.size, (10, 15, 32))
        background.paste(img, mask=img.split()[3] if img.mode == 'RGBA' else None)
        img = background
    else:
        img = img.convert('RGB')
        
    img.save(output_png, "PNG")
    print(f"Saved 24-bit PNG to {output_png}")
    
    img.save(output_jpg, "JPEG", quality=95)
    print(f"Saved JPEG to {output_jpg}")

if __name__ == '__main__':
    asyncio.run(main())
