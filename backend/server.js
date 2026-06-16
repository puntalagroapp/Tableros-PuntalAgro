const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// ⚠️ Crucial: Servir la carpeta del cliente de forma estática
app.use(express.static(path.join(__dirname, '../frontend')));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Endpoint para parches granulares JSONB
app.patch('/api/json-patch', async (req, res) => {
    const { claveRaiz, ruta, valor } = req.body;
    try {
        const postgresPath = ruta.split('.');
        const query = `
            UPDATE tableros 
            SET data_json = jsonb_set(data_json, $1::text[], $2::jsonb, true), updated_at = NOW()
            WHERE nombre_clave = $3;
        `;
        await pool.query(query, [postgresPath, JSON.stringify(valor), claveRaiz]);
        res.json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(8080, () => console.log('🔥 API lista en puerto 8080'));