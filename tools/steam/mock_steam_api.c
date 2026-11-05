#include <stdlib.h>
// Подставная libsteam_api для проверки FFI: пишет вызовы в stderr, выдаёт два обратных вызова.
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
typedef struct { int32_t user; int32_t id; uint8_t *param; int32_t size; } CallbackMsg_t;
static int step = 0;
static struct { uint64_t sid; char connect[256]; } join;
static struct { uint8_t active; bool user; uint32_t app; uint32_t pid; } ov;
static uint8_t stats[32];
static int ach = 0;
#define L(...) do { fprintf(stderr, "[mock] " __VA_ARGS__); fputc('\n', stderr); } while (0)
bool SteamAPI_RestartAppIfNecessary(uint32_t a) { L("Restart %u", a); return false; }
int SteamAPI_InitFlat(char *err) { L("InitFlat env=%s", getenv("SteamAppId")); return 0; }
void SteamAPI_Shutdown(void) { L("Shutdown"); }
int32_t SteamAPI_GetHSteamPipe(void) { return 7; }
void SteamAPI_ManualDispatch_Init(void) { L("DispatchInit"); }
void SteamAPI_ManualDispatch_RunFrame(int32_t p) { step++; }
bool SteamAPI_ManualDispatch_GetNextCallback(int32_t p, CallbackMsg_t *m) {
  if (step == 3) { step++; m->user = 1; m->id = 1101; m->param = stats; m->size = 24; return true; }
  if (step == 400 && getenv("MOCK_JOIN")) { step++; join.sid = 123; snprintf(join.connect, 256, "--w25-join=%s --w25-server=ws://127.0.0.1:2599", getenv("MOCK_JOIN")); m->id = 337; m->param = (uint8_t*)&join; m->size = sizeof(join); return true; }
  if (step == 250) { step++; ov.active = 1; m->id = 331; m->param = (uint8_t*)&ov; m->size = sizeof(ov); return true; }
  return false;
}
void SteamAPI_ManualDispatch_FreeLastCallback(int32_t p) {}
void *SteamAPI_SteamFriends_v018(void) { return (void*)1; }
void *SteamAPI_SteamUserStats_v013(void) { return (void*)2; }
void *SteamAPI_SteamApps_v009(void) { return (void*)3; }
void *SteamAPI_SteamUtils_v011(void) { return (void*)4; }
const char *SteamAPI_ISteamFriends_GetPersonaName(void *s) { return "Тестер"; }
void SteamAPI_ISteamFriends_ActivateGameOverlay(void *s, const char *d) { L("Overlay %s", d); }
void SteamAPI_ISteamFriends_ActivateGameOverlayInviteDialogConnectString(void *s, const char *c) { L("Invite '%s'", c); }
bool SteamAPI_ISteamFriends_SetRichPresence(void *s, const char *k, const char *v) { L("RP %s='%s'", k, v); return true; }
void SteamAPI_ISteamFriends_ClearRichPresence(void *s) { L("RP clear"); }
bool SteamAPI_ISteamUserStats_SetAchievement(void *s, const char *n) { L("SetAch %s", n); return step >= 4; }
bool SteamAPI_ISteamUserStats_GetAchievement(void *s, const char *n, bool *d) { *d = false; return true; }
bool SteamAPI_ISteamUserStats_ClearAchievement(void *s, const char *n) { return true; }
bool SteamAPI_ISteamUserStats_StoreStats(void *s) { L("StoreStats"); return true; }
uint32_t SteamAPI_ISteamUserStats_GetNumAchievements(void *s) { return 4; }
int SteamAPI_ISteamApps_GetLaunchCommandLine(void *s, char *b, int n) { L("LaunchCmd buf=%d", n); return 0; }
const char *SteamAPI_ISteamApps_GetCurrentGameLanguage(void *s) { return "russian"; }
bool SteamAPI_ISteamUtils_IsOverlayEnabled(void *s) { return true; }
void SteamAPI_ISteamUtils_SetOverlayNotificationPosition(void *s, int p) { L("NotifPos %d", p); }
