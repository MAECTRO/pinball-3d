# 3D Pinball Game (HTML5 / WebGL)

3D-игра «Пинбол» для публикации в VK Mini Apps (Direct Games) и VK Play на основе 3D-модели стола Gilligan's Island.

## Стек технологий
- **Vite** — быстрый бандлер и dev-сервер
- **Three.js** — WebGL-рендеринг, тени, шейдеры и `FBXLoader`
- **@dimforge/rapier3d-compat** — физический движок (WebAssembly) с поддержкой Trimesh-коллайдеров и Continuous Collision Detection (CCD) для шарика
- **@vkontakte/vk-bridge** — интеграция платформы ВКонтакте (инициализация, сохранение рекордов, rewarded-реклама)

## Управление
- **Левый флиппер:** `A` / `ArrowLeft` / `Left Shift` или клик/тап по левой половине экрана
- **Правый флиппер:** `D` / `ArrowRight` / `Right Shift` или клик/тап по правой половине экрана
- **Плунжер:** зажатие `Space` / `ArrowDown` или зажатие кнопки пуска на экране (накопление силы импульса)
- **Респавн шарика:** клавиша `R`
- **Дебаг физических коллайдеров:** клавиша `F1` (отрисовка Rapier debug wireframes)

## Установка и запуск

```bash
# Установка зависимостей
npm install

# Запуск dev-сервера
npm run dev

# Сборка продакшен-бандла
npm run build
```
