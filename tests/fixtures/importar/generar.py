# Genera los zips de prueba con la biblioteca zipfile de Python (otra implementación, no la nuestra).
# Uso: python3 tests/fixtures/importar/generar.py   (desde la raíz del repo)
# Los datos son inventados: NO imitan el formato de Loop ni de otra app (eso llega con tus muestras en I2).
import os, zipfile

aqui = os.path.dirname(os.path.abspath(__file__))
def ruta(n): return os.path.join(aqui, n)

csv = 'fecha;habito;valor\r\n2026-01-01;"Café, «té» y 🧘";1,5\r\n2026-01-02;Leer;2\r\n'.encode('utf-8')
with zipfile.ZipFile(ruta('normal.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('carpeta/', '')
    z.writestr('carpeta/Datos.csv', csv)
    z.writestr('Otro.csv', 'a,b\n1,2\n', compress_type=zipfile.ZIP_STORED)
    z.writestr('001 Hábito ñandú/Datos.csv', 'x\n1\n')

with zipfile.ZipFile(ruta('slip.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('bueno.csv', 'a\n1\n')
    z.writestr('../malo.csv', 'a\n1\n')
    z.writestr('/abs.csv', 'a\n1\n')
    z.writestr('c/../../x.csv', 'a\n1\n')

# Bomba: 3 MB de ceros comprimen a unos pocos KB (relación >> 100:1).
with zipfile.ZipFile(ruta('bomba.zip'), 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.writestr('ceros.csv', b'0' * (3 * 1024 * 1024))

with zipfile.ZipFile(ruta('vacio.zip'), 'w') as z:
    pass
print('listo')
