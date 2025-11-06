"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/routes/clinics.ts
const express_1 = __importDefault(require("express"));
const clinicsController_1 = require("../controllers/clinicsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const supabase_1 = require("../config/supabase");
const createClinicPublic_1 = require("../controllers/clinics/createClinicPublic");
const checkClinicCnpj_1 = require("../controllers/clinics/checkClinicCnpj");
const getClinics_1 = require("../controllers/clinics/getClinics");
const getClinicById_1 = require("../controllers/clinics/getClinicById");
const router = express_1.default.Router();
/**
 * ===========================================================
 * 🏥 FLUXO DE CADASTRO PÚBLICO (sem login)
 * ===========================================================
 */
router.post('/register', createClinicPublic_1.createClinicPublic);
router.post('/', createClinicPublic_1.createClinicPublic);
/**
 * ===========================================================
 * 🏢 FLUXO INTERNO (clínicas autenticadas)
 * ===========================================================
 */
router.post('/register-with-unit', authMiddleware_1.authenticateUser, clinicsController_1.registerClinicWithUnit);
/**
 * ===========================================================
 * 🔍 CONSULTAS E VALIDAÇÕES
 * ===========================================================
 */
router.get('/', getClinics_1.getClinics);
router.get('/check-cnpj/:cnpj', clinicsController_1.checkCNPJ);
router.get('/check-email/:email', clinicsController_1.checkEmail);
router.get('/check-cnpj/:cnpj', checkClinicCnpj_1.checkClinicCnpj);
router.get('/:id', getClinicById_1.getClinicById);
/**
 * ===========================================================
 * ✏️ ATUALIZAÇÃO DE DADOS
 * ===========================================================
 */
router.put('/:id', authMiddleware_1.authenticateUser, async (req, res) => {
    const { id } = req.params;
    const { name, email, cnpj, phone, address, city, state, status } = req.body;
    try {
        const { data, error } = await supabase_1.supabase
            .from('clinics')
            .update({
            name,
            email,
            cnpj,
            phone,
            address,
            city,
            state,
            status,
            updated_at: new Date().toISOString(),
        })
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw error;
        return res.json({
            success: true,
            message: 'Clínica atualizada com sucesso',
            clinic: data,
        });
    }
    catch (error) {
        console.error('Erro ao atualizar clínica:', error);
        return res.status(500).json({
            error: error.message || 'Erro ao atualizar clínica',
        });
    }
});
/**
 * ===========================================================
 * 🖼️ FOTO E EXCLUSÃO
 * ===========================================================
 */
router.get('/check-cnpj/:cnpj', checkClinicCnpj_1.checkClinicCnpj);
router.get('/', getClinics_1.getClinics);
router.get('/:id', getClinicById_1.getClinicById);
router.patch('/:id/photo', authMiddleware_1.authenticateUser, clinicsController_1.updateClinicPhoto);
router.delete('/:id', authMiddleware_1.authenticateUser, clinicsController_1.deleteClinic);
exports.default = router;
