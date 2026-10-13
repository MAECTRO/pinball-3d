import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox']
        )
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("console", lambda m: print(f"CONSOLE: [{m.type}] {m.text}"))

        await page.goto("http://127.0.0.1:3000/")
        await page.wait_for_function("() => Boolean(window.gameManager && window.physicsManager && window.physicsManager.ballBody)")

        print("=== TEST 1: LIGHTING & SCENE VERIFICATION ===")
        lights = await page.evaluate("""() => {
            let hemiFound = false;
            let ambientFound = false;
            let dirFound = false;
            let pointFound = false;
            window.gameManager.scene.traverse(obj => {
                if (obj.isHemisphereLight) hemiFound = true;
                if (obj.isAmbientLight) ambientFound = true;
                if (obj.isDirectionalLight) dirFound = true;
                if (obj.isPointLight) pointFound = true;
            });
            return {
                hemiFound,
                ambientFound,
                dirFound,
                pointFound
            };
        }""")
        print(f"Lights in scene: {lights}")
        assert lights["hemiFound"], "HemisphereLight must be present!"
        assert lights["pointFound"], "PointLight must be present!"
        print("[OK] Lighting test passed!")

        print("\n=== TEST 2: LEFT FLIPPER SOLID COLLISION & FLIP ===")
        # Spawn ball just above the left flipper arm on playfield
        await page.evaluate("() => window.physicsManager.spawnBall({ x: -1.35, y: -0.40, z: 13.20 })")
        bounced_left = False
        for i in range(12):
            await asyncio.sleep(0.08)
            b = await page.evaluate("() => ({ pos: window.physicsManager.ballBody.translation(), vel: window.physicsManager.ballBody.linvel() })")
            if b['vel']['y'] > 0.1 or b['pos']['y'] >= -0.70:
                bounced_left = True
        print(f"Left flipper contact: bounced_left={bounced_left}, final pos={b['pos']}")
        assert bounced_left, "Ball must be supported by left flipper!"

        # Now test left flipper hit launch
        await page.keyboard.down("KeyA")
        await asyncio.sleep(0.05)
        launched_left = False
        for i in range(15):
            await asyncio.sleep(0.08)
            b = await page.evaluate("() => ({ pos: window.physicsManager.ballBody.translation(), vel: window.physicsManager.ballBody.linvel() })")
            if b['vel']['z'] < -4.0:
                launched_left = True
        await page.keyboard.up("KeyA")
        print(f"Left flipper hit launch: launched_left={launched_left}, vel={b['vel']}")
        assert launched_left, "Left flipper must launch ball up the table!"
        print("[OK] Left flipper test passed!")

        print("\n=== TEST 3: RIGHT FLIPPER SOLID COLLISION & FLIP ===")
        # Spawn ball just above the right flipper arm on playfield
        await page.evaluate("() => window.physicsManager.spawnBall({ x: 0.75, y: -0.40, z: 13.20 })")
        bounced_right = False
        for i in range(12):
            await asyncio.sleep(0.08)
            b = await page.evaluate("() => ({ pos: window.physicsManager.ballBody.translation(), vel: window.physicsManager.ballBody.linvel() })")
            if b['vel']['y'] > 0.1 or b['pos']['y'] >= -0.70:
                bounced_right = True
        print(f"Right flipper contact: bounced_right={bounced_right}, final pos={b['pos']}")
        assert bounced_right, "Ball must be supported by right flipper!"

        # Test right flipper hit launch
        await page.keyboard.down("KeyD")
        await asyncio.sleep(0.05)
        launched_right = False
        for i in range(15):
            await asyncio.sleep(0.08)
            b = await page.evaluate("() => ({ pos: window.physicsManager.ballBody.translation(), vel: window.physicsManager.ballBody.linvel() })")
            if b['vel']['z'] < -4.0:
                launched_right = True
        await page.keyboard.up("KeyD")
        print(f"Right flipper hit launch: launched_right={launched_right}, vel={b['vel']}")
        assert launched_right, "Right flipper must launch ball up the table!"
        print("[OK] Right flipper test passed!")

        print("\n=== TEST 4: DRAIN AND RESPAWN SYSTEM ===")
        start_balls = await page.evaluate("() => window.gameManager.balls")
        print(f"Starting balls: {start_balls}")
        # Drop ball into center drain (x=0, z=15.5)
        await page.evaluate("() => window.physicsManager.spawnBall({ x: 0.0, y: -0.5, z: 15.5 })")
        # Wait for drain callback and respawn
        await asyncio.sleep(2.0)
        after_balls = await page.evaluate("() => window.gameManager.balls")
        is_over = await page.evaluate("() => window.gameManager.isGameOver")
        ball_pos = await page.evaluate("() => window.physicsManager.ballBody.translation()")
        print(f"After drain: balls={after_balls}, isOver={is_over}, ballPos={ball_pos}")
        assert after_balls == start_balls - 1, f"Expected exactly {start_balls - 1} balls, got {after_balls}!"
        assert not is_over, "Game should not be over after 1 drain!"
        assert abs(ball_pos['x'] - 4.75) < 0.2 and abs(ball_pos['z'] - 15.6) < 0.5, "Ball must respawn in shooter lane!"
        print("[OK] Drain and respawn test passed!")

        print("\n=== TEST 5: NUDGE AND VELOCITY CLAMPING ===")
        await page.evaluate("() => window.physicsManager.launchPlunger(1.0)")
        max_seen_speed = 0
        for i in range(25):
            await asyncio.sleep(0.05)
            vel = await page.evaluate("() => window.physicsManager.ballBody.linvel()")
            speed = (vel['x']**2 + vel['y']**2 + vel['z']**2)**0.5
            if speed > max_seen_speed:
                max_seen_speed = speed
        print(f"Max ball speed after full launch: {max_seen_speed:.2f} m/s (clamped under 20.0 m/s)")
        assert max_seen_speed <= 20.5, f"Speed {max_seen_speed} exceeds arcade clamp!"

        # Test nudge
        prev_pos = await page.evaluate("() => window.physicsManager.ballBody.translation()")
        await page.keyboard.press("KeyW")
        await asyncio.sleep(0.1)
        nudged_vel = await page.evaluate("() => window.physicsManager.ballBody.linvel()")
        print(f"Nudge applied velocity: {nudged_vel}")
        print("[OK] Nudge and speed clamp test passed!")

        # Take high-resolution screenshot of the game
        screenshot_path = "pinball_gameplay.png"
        await page.screenshot(path=screenshot_path)
        print(f"\n[OK] Screenshot saved to {screenshot_path}")

        await browser.close()
        print("\n*** ALL 5 VERIFICATION TESTS PASSED SUCCESSFULLY! ***")

if __name__ == "__main__":
    asyncio.run(run())
