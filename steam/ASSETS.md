# Изображения для Steamworks: какой файл куда загружать

Все кадры сняты из игры в качестве «Ультра» в режиме съёмки `?shots=1` (без значка пинга и служебных
элементов), английский интерфейс. Размеры сверены с требованиями Steamworks (новые размеры капсул с 2024 г.;
старые 460×215, 231×87, 616×353, 374×448 больше не принимаются). Проверка размеров встроена в
`tools/art/capsules.py`.

## Store Admin → Graphical Assets → Store Assets

| Поле Steamworks | Размер | Файл | Примечание |
|---|---|---|---|
| Header Capsule | 920×430 | `art/header_capsule_920x430.png` | Вверху страницы, «Рекомендуемое», списки; логотип обязателен |
| Small Capsule | 462×174 | `art/small_capsule_462x174.png` | Поиск, списки; логотип крупно, чтобы читался |
| Main Capsule | 1232×706 | `art/main_capsule_1232x706.png` | Большая витрина на главной странице Steam |
| Vertical Capsule | 748×896 | `art/vertical_capsule_748x896.png` | Сезонные распродажи |
| Page Background | 1438×810 | `art/page_background_1438x810.png` | Необязательно: фон страницы (размыт и приглушён) |

## Store Admin → Graphical Assets → Screenshots

Минимум 5 скриншотов 16:9 (не меньше 1920×1080). Загружайте по порядку: первые четыре Steam показывает
в поиске и при наведении.

| № | Файл | Что на кадре |
|---|---|---|
| 1 | `screenshots/01_red_dragon_1920x1080.jpg` | Финальный бой: красный дракон, огненное дыхание |
| 2 | `screenshots/02_island_horde_1920x1080.jpg` | Кооп-бой на острове: орда, умения мага |
| 3 | `screenshots/03_troll_chieftain_1920x1080.jpg` | Босс тролль-вождь, оборотень в зверином облике |
| 4 | `screenshots/04_dragon_lair_1920x1080.jpg` | Логово дракона: дракончики, огнеплюи, взрывы |
| 5 | `screenshots/05_pvp_duel_1920x1080.jpg` | ПвП-дуэль на арене |
| 6 | `screenshots/06_tavern_shop_1920x1080.jpg` | Лавка в таверне «Пьяный Дракон», снаряжение героя |
| 7 | `screenshots/07_dragon_fight_1920x1080.jpg` | Бой с драконом, другой состав героев и подмога |
| 8 | `screenshots/08_class_select_1920x1080.jpg` | Лобби: выбор героя и его умения |
| 9 | `screenshots/09_main_menu_1920x1080.jpg` | Все семь героев у костра (необязательно: Valve советует показывать игру, а не меню) |

## Library Admin → Library Assets

| Поле Steamworks | Размер | Файл | Примечание |
|---|---|---|---|
| Library Capsule | 600×900 | `art/library_capsule_600x900.png` | Обложка в библиотеке; логотип обязателен |
| Library Header | 920×430 | `art/library_header_920x430.png` | Плитка «Недавние игры» |
| Library Hero | 3840×1240 | `art/library_hero_3840x1240.png` | Фон над страницей игры; **без текста и логотипа** |
| Library Logo | 1280×720 | `art/library_logo_1280x720.png` | Прозрачный PNG; в редакторе Steamworks поставьте его слева внизу поверх Hero |

## Community и клиент

| Поле Steamworks | Размер | Файл |
|---|---|---|
| App Admin → Community → Community Icon | 184×184 | `art/community_icon_184x184.jpg` |
| Иконка исполняемого файла | — | уже зашита в сборку (`desktop/build/icon.ico`, `icon.png`) |

## Правила, о которых стоит помнить

- На капсулах — только арт и логотип игры: без цитат, оценок, наград, скидок и надписей «Новинка».
- Hero — без текста; логотип накладывается отдельным файлом (Library Logo).
- Скриншоты — реальная игра, а не концепт-арт; первые четыре — самые зрелищные.
- После загрузки нажмите **Publish** — без этого изображения не появятся на странице.

## Как пересоздать

```bash
cd client && npx vite --port 5173 &                       # dev-сервер
cd /tmp/shots
Q=ultra LANG_UI=en TMO=1200000 node /путь/к/tools/browser/steamshots.cjs dragon 1920x1080   # и другие сцены
Q=ultra T=2300 node /путь/к/tools/browser/keyart.cjs ka_wide 2560x1200 6,3.2,14 -0.5,2.9,2.5 36
Q=ultra T=2300 node /путь/к/tools/browser/keyart.cjs ka_tall 1200x1500 5,3.4,14.5 -0.4,3.4,2.5 50
Q=ultra T=2300 node /путь/к/tools/browser/keyart.cjs ka_hero 3840x1240 6,3.2,14 -0.5,2.9,2.5 30
cp /путь/к/steam/art/library_logo_1280x720.png logo_1280x720.png
python3 /путь/к/tools/art/capsules.py                    # пишет steam/art/ и проверяет размеры
```
