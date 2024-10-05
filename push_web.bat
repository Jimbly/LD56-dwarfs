@SET TORTOISE_PATH=%ProgramW6432%\TortoiseSVN\bin\TortoiseProc.exe
@SET DEST=..\..\SRC2\web\dashingstrike.com\LudumDare\LD56\

call node build build

rd /s /q %DEST%
md %DEST%
xcopy /SY dist\game\build.prod\client %DEST%

"%TORTOISE_PATH%" /command:commit /path:%DEST%  /logmsg:"LD56"

@pushd ..\..\SRC2\flightplans

@echo.
@echo.
@echo NEXT: Run `npm run web-prod` in the Node 12 shell
@node12shell