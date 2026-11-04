# Yandex Games — test build and release checklist

`npm run package:yandex` produces `knights-yandex-games.zip`. It contains the
static game with `/sdk.js`, without the Beget PHP relay or deploy scripts.
The normal `npm run build` remains the Beget build; it uses same-origin
multiplayer, whereas the Yandex archive points to the public HTTPS relay set
in `.env.yandex`. The value is compiled into the game and must be a public
HTTPS service, not a local address.

The platform builds use the Cloud4box relay at
`https://ezegames.ru/api/mp.php`, installed separately in
`/www/ezegames.ru/api/mp.php`. The legacy Beget FTP workflow does not deploy
this Cloud4box endpoint. Preserve its runtime directory and verify the web
server denies direct access to it. Older builds still use `igra.cosmorox.ru`;
keep the old host allowed until those builds have been replaced.

Before submitting the game:

1. Upload the **Yandex** archive to the draft. Add `ezegames.ru`
   under allowed external hosts. Check the relay's HTTPS certificate, CORS and
   hosting anti-bot rules from the actual Yandex iframe. A successful unit test
   or an unconfigured Beget deploy does not establish that it is reachable.
2. In Yandex's debug panel, verify real SDK initialization, Game Ready after
   assets have loaded, every declared language, pause/focus behavior, and the
   rewarded ad's completed, cancelled, unavailable and error cases.
3. Run a two-player match from separate browsers/devices through Yandex,
   including room creation, joining, combat, disconnection and rematch. Test
   PHP relay capacity and third-party cookie/anti-bot behavior. The service is
   external: it must remain online and compliant with Yandex's host policy.
4. Test cloud progress with the SDK mock and actual guest and authorized
   accounts: purchase/unlock, reload, another device, offline writes,
   account-switch dialog and conflicting progress. Only enable the cloud-save
   draft option once those tests pass. Cloud stores the player profile (coins,
   unlocked/active heroes and stats); local graphics settings stay local.
   Pending writes are persisted locally and compared against a previously read
   cloud snapshot. Simultaneous writes cannot be made transactional by the SDK;
   avoid playing the same account on multiple devices at the same instant.
5. Declare desktop only unless mobile controls have independently been added and
   tested. Add at least two desktop screenshots and a real horizontal gameplay
   video that meets Yandex's current requirements. The project does not contain
   a finished gameplay video.
6. The checked-in asset notices document known sources, including the new
   procedural checker-stone maps. Review remaining third-party provenance and
   license terms independently before distribution; a credits screen is not a
   substitute for confirming rights.
