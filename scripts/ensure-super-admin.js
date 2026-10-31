require('dotenv').config();
const db = require('../src/api/services/mysqlClient');

async function run() {
    try {
        await db.query("UPDATE control_users SET role = 'SUPER_ADMIN' WHERE email = 'admin@printprice.pro'");
        console.log("Rol actualizado correctamente a SUPER_ADMIN en la base de datos.");
        
        const result = await db.query("SELECT * FROM control_users WHERE email = 'admin@printprice.pro'");
        console.log("Datos del usuario:", result[0] || "Usuario no encontrado, debes crearlo primero.");
    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit(0);
    }
}

run();
