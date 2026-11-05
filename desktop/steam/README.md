# Библиотека Steam

`redist/<os>/` — `steam_api` из Steamworks SDK **1.65** (`sdk/redistributable_bin`): `win64/steam_api64.dll`,
`linux64/libsteam_api.so`, `osx/libsteam_api.dylib` (универсальная). При сборке electron-builder кладёт
нужную в `resources/steam/` рядом с игрой.

Обновление SDK: заменить три файла и проверить в `desktop/steam.cjs` версии интерфейсов
(`SteamAPI_SteamFriends_v018` и т. п.) по `public/steam/steam_api_flat.h` нового SDK.
Заголовки и остальной SDK в репозиторий не кладём — библиотека вызывается через FFI (koffi).
