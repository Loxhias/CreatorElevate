@echo off
echo ========================================================
echo     HERRAMIENTA PARA SUBIR CAMBIOS A GITHUB (PUSH)
echo ========================================================
echo.

set /p msg="Escribe el mensaje para el commit (o presiona Enter para usar 'Actualizacion automatica'): "
if "%msg%"=="" set msg=Actualizacion automatica

echo.
echo [1/3] Agregando archivos...
git add .

echo.
echo [2/3] Creando commit...
git commit -m "%msg%"

echo.
echo [3/3] Subiendo cambios a GitHub...
git push origin main

echo.
echo ========================================================
echo                 ¡PROCESO COMPLETADO!
echo ========================================================
pause
