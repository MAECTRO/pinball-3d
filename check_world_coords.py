import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox']
        )
        page = await browser.new_page()
        await page.goto("http://127.0.0.1:3000/", timeout=30000)

        for _ in range(40):
            ready = await page.evaluate("() => Boolean(window.__PINBALL_MESHES__ && window.__PINBALL_MESHES__.length > 0)")
            if ready: break
            await asyncio.sleep(0.5)

        world_coords = await page.evaluate("""() => {
            const list = [];
            window.pinballFBX.traverse(obj => {
                const name = obj.name.toLowerCase();
                if (['flipper', 'flipper001', 'bumperassembly', 'shooter', 'playfield', 'metalwalls', 'apron'].includes(name) ||
                    name.includes('bumpercap_lp003') || name.includes('lsling') || name.includes('rsling')) {
                    const worldPos = new THREE.Vector3();
                    obj.getWorldPosition(worldPos);
                    const box = new THREE.Box3().setFromObject(obj);
                    const size = new THREE.Vector3();
                    box.getSize(size);
                    list.push({
                        name: obj.name,
                        worldPos: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
                        size: { x: size.x, y: size.y, z: size.z }
                    });
                }
            });
            return list;
        }""")
        print("World Coords of key meshes:")
        import json
        print(json.dumps(world_coords, indent=2))
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
