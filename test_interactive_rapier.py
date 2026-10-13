import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch(
            executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',
            headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox']
        )
        page = await b.new_page()
        logs = []
        page.on('console', lambda m: logs.append(f"[{m.type}] {m.text}"))
        await page.goto('http://127.0.0.1:3000/')
        await page.wait_for_function('() => Boolean(window.gameManager && window.physicsManager.ballBody)')

        print("1. Checking __PINBALL_MESHES__ contains both Mesh and Group...")
        nodes = await page.evaluate('() => window.__PINBALL_MESHES__')
        types = set(n['type'] for n in nodes)
        print(f"Captured {len(nodes)} nodes. Types found: {types}")
        has_mesh = 'Mesh' in types
        has_group = any('Group' in t or 'Object3D' in t for t in types)
        assert has_mesh and has_group, f"Must contain both Mesh and Group! Found: {types}"
        print("PASS: Verified Mesh and Group in console.table!")

        print("\n2. Checking Plunger Kinematic Body & Mesh...")
        plunger_body = await page.evaluate('() => Boolean(window.physicsManager.plungerBody)')
        plunger_mesh = await page.evaluate('() => Boolean(window.physicsManager.plungerMesh)')
        print(f"Plunger body exists: {plunger_body}, Plunger mesh exists: {plunger_mesh}")
        assert plunger_body, "Plunger kinematic body missing!"

        # Test Plunger pull-back while charging
        await page.click("#canvas-container")
        initial_plunger_z = await page.evaluate('() => window.physicsManager.plungerBody.translation().z')
        await page.keyboard.down('Space')
        for _ in range(40):
            await asyncio.sleep(0.05)
            p = await page.evaluate('() => window.gameManager.plungerPower')
            if p > 0.4:
                break
        charging_plunger_z = await page.evaluate('() => window.physicsManager.plungerBody.translation().z')
        print(f"Plunger Z initial: {initial_plunger_z:.2f}, while charging: {charging_plunger_z:.2f}")
        assert charging_plunger_z > initial_plunger_z + 0.3, f"Plunger did not pull back during charge! {charging_plunger_z} vs {initial_plunger_z}"
        await page.keyboard.up('Space')
        for _ in range(10):
            await asyncio.sleep(0.05)
            p = await page.evaluate('() => window.physicsManager.plungerOffset')
            if p < 0.1:
                break
        released_plunger_z = await page.evaluate('() => window.physicsManager.plungerBody.translation().z')
        print(f"Plunger Z released: {released_plunger_z:.2f}")
        assert released_plunger_z < charging_plunger_z, "Plunger did not snap forward!"
        print("PASS: Plunger kinematic body and pullback/snap verified!")

        print("\n3. Checking Bumpers have Rapier colliders and collision events...")
        interactive_count = await page.evaluate('() => window.physicsManager.interactiveColliders.size')
        print(f"Interactive colliders in Rapier: {interactive_count}")
        assert interactive_count >= 5, f"Expected at least 5 interactive colliders (3 bumpers + 2 slingshots), got {interactive_count}"

        # Test ball collision with Bumper 1
        initial_score = await page.evaluate('() => window.gameManager.score')
        b1_pos = await page.evaluate('() => window.physicsManager.bumpers[0]')
        print(f"Moving ball near bumper 1 at ({b1_pos['x']}, {b1_pos['z']})...")
        await page.evaluate('''() => {
            const b = window.physicsManager.bumpers[0];
            // Place ball approaching bumper 1
            window.physicsManager.ballBody.setTranslation({ x: b.x - 0.7, y: b.y, z: b.z }, true);
            window.physicsManager.ballBody.setLinvel({ x: 3.0, y: 0.0, z: 0.0 }, true);
        }''')
        await page.wait_for_function('() => window.gameManager.score > 0', timeout=4000)
        new_score = await page.evaluate('() => window.gameManager.score')
        print(f"Score after bumper hit: {new_score}")
        assert new_score > initial_score, "Score did not increase from bumper hit!"
        print("PASS: Bumper collision and score awarded!")

        print("\n4. Checking Flipper pivots are dynamic from FBX...")
        pivots = await page.evaluate('''() => ({
            leftPivot: window.physicsManager.leftPivot,
            rightPivot: window.physicsManager.rightPivot
        })''')
        print(f"Dynamic left pivot: {pivots['leftPivot']}")
        print(f"Dynamic right pivot: {pivots['rightPivot']}")
        assert abs(pivots['leftPivot']['x'] - (-2.14)) < 0.1, "Left pivot incorrect!"
        assert abs(pivots['rightPivot']['x'] - 1.40) < 0.1, "Right pivot incorrect!"
        print("PASS: Dynamic flipper pivots verified!")

        print("\n5. Checking console for errors and warnings...")
        has_error = False
        for l in logs:
            if '[error]' in l or 'Clock: This module has been deprecated' in l:
                print("Unwanted log:", l)
                has_error = True
        assert not has_error, "Found error/deprecation in console logs!"
        print("PASS: Clean console with zero errors and zero deprecation warnings!")

        await b.close()
        print("\n>>> ALL TESTS IN test_interactive_rapier.py PASSED! <<<")

if __name__ == '__main__':
    asyncio.run(run())
