import os
import asyncio
from playwright.async_api import async_playwright
from PIL import Image

async def main():
    html_path = os.path.abspath('screenshots_ready/promo.html')
    output_png = 'screenshots_ready/promo_1280x800.png'
    output_jpg = 'screenshots_ready/promo_1280x800.jpg'
    
    # 1. Capture screenshot using playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})
        await page.goto(f'file:///{html_path}')
        # Wait a bit to ensure fonts and everything are loaded
        await page.wait_for_timeout(1000)
        await page.screenshot(path=output_png, full_page=False)
        await browser.close()
        print(f"Captured initial screenshot to {output_png}")

    # 2. Convert to 24-bit PNG/JPEG without alpha
    img = Image.open(output_png)
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        # Create a solid background (e.g., white or black) to replace transparency
        background = Image.new('RGB', img.size, (10, 15, 32)) # matching top-left of gradient roughly
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
