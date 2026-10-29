# Mi Gimnasio

App para administrar el gimnasio: clientes y planes, agenda, dinero (efectivo y BAC), código de acceso, mantenimiento e insumos.

- Se abre en el navegador y se instala en el iPhone desde Safari: **Compartir → Agregar a inicio**.
- Los datos viven en Supabase, protegidos con inicio de sesión. Este repositorio solo tiene el diseño de la app, ningún dato.
- `supabase/schema.sql` crea la tabla y sus reglas de acceso.
- `config.js` lleva la dirección del proyecto de Supabase y su llave pública.
