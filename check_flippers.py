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
            ready = await page.evaluate("() => Boolean(window.pinballFBX)")
            if ready: break
            await asyncio.sleep(0.5)

        pivot_info = await page.evaluate("""() => {
            let leftFlipper = null, rightFlipper = null;
            window.pinballFBX.traverse(obj => {
                if (obj.name.toLowerCase() === 'flipper001') leftFlipper = obj;
                if (obj.name.toLowerCase() === 'flipper') rightFlipper = obj;
            });
            
            function getPivotData(mesh) {
                if (!mesh) return null;
                const pos = mesh.position.clone();
                const rot = mesh.rotation.clone();
                const geomBox = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);
                const parentName = mesh.parent ? mesh.parent.name : null;
                const parentPos = mesh.parent ? mesh.parent.position : null;
                const parentRot = mesh.parent ? mesh.parent.rotation : null;
                return {
                    name: mesh.name,
                    localPos: { x: pos.x, y: pos.y, z: pos.z },
                    localRot: { x: rot.x, y: rot.y, z: rot.z },
                    geomMin: { x: geomBox.min.x, y: geomBox.min.y, z: geomBox.min.z },
                    geomMax: { x: geomBox.max.x, y: geomBox.max.y, z: geomBox.max.z },
                    parentName,
                    parentPos,
                    parentRot
                };
            }
            return {
                left: getPivotData(leftFlipper),
                right: getPivotData(rightFlipper)
            };
        }""")
        import json
        print(json.dumps(pivot_info, indent=2))
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
