# Carro listo

Planificador de traslados con historial compartido en Cloud Firestore.

## Configurar Firebase

1. En Firebase Console, creá o elegí un proyecto, registrá una aplicación web y creá una base de datos de Cloud Firestore.
2. Copiá los valores de configuración de la aplicación web en `.env` (podés usar `.env.example` como referencia). Las variables `VITE_*` se incluyen en el código que recibe el navegador; la configuración web de Firebase no es una contraseña.
3. En las reglas de Firestore, habilitá lectura para visitantes y creación de documentos para guardar cálculos. Como la página no tiene inicio de sesión, cada persona escribe el nombre que quiere mostrar. Las reglas siguientes permiten consultar el historial y crear registros, pero no editar ni borrar registros existentes:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /calculationHistory/{entryId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasOnly([
          'operatorName', 'quantity', 'groups', 'result', 'allocations', 'createdAt'
        ])
        && request.resource.data.operatorName is string
        && request.resource.data.operatorName.size() > 0
        && request.resource.data.operatorName.size() <= 80
        && request.resource.data.quantity is int
        && request.resource.data.quantity > 0
        && request.resource.data.groups is list
        && request.resource.data.result is map
        && request.resource.data.allocations is list
        && request.resource.data.createdAt == request.time;
      allow update, delete: if false;
    }
  }
}
```

La app conserva y muestra todos los cálculos en tiempo real, ordenados del más reciente al más antiguo. El historial está disponible para cualquiera que visite el sitio conectado a ese proyecto de Firebase.

## Desarrollo

```sh
npm install
npm run dev
```

Reiniciá el servidor de desarrollo después de editar `.env`.
