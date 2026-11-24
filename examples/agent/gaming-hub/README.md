# Gaming Central Hub

Jimsabz gaming hub architecture

main.jimsabz: runs the account flow and declares the 3D views behind the login gate.
modules/auth.jimsabz: validates a temporary local account and limits login attempts.
modules/hub.jimsabz: imports gui3d and defines shared scene/HUD state; main declares the Home / Arena / Library / Profile views and guarded navigation.

Run opens the separate output window for registration and login. After a valid login, select Game in that window for the 3D hub.

The current runtime provides console input, native scenes, keyboard events and HUD text. It has no password-masking or web form API. The generated local demo keeps credentials in memory for this run only; it is not production authentication. A real account product needs a separately implemented account service, password hashing, session validation and persistent storage.

## Run

Open main.jimsabz, then Run code. In the separate output window create a demo user and passphrase, then enter the same values to sign in. There are 3 attempts. Click Game, then use 1 / 2 / 3 to select a section, H for Home and L to sign out. The sections display 3D gallery previews; no playable Arena game or account backend is supplied.

Local demo only: console passphrases are visible and accounts last for one run. Use invented values. Production account storage, password hashing, server sessions and editable graphical login fields are not implemented.

## Check boundaries

The agent compiles the full project and checks the successful console login fixture with the Studio VM. Automated VM checks cannot certify production security, final graphics, audio, accessibility or frame rate.
