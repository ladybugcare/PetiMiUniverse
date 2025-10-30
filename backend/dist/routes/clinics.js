"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const clinicsController_1 = require("../controllers/clinicsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.post('/register', clinicsController_1.createClinic);
router.post('/register-with-unit', authMiddleware_1.authenticateUser, clinicsController_1.registerClinicWithUnit);
router.get('/', clinicsController_1.getClinics);
router.get('/check-cnpj/:cnpj', clinicsController_1.checkCNPJ);
router.get('/check-email/:email', clinicsController_1.checkEmail);
router.get('/:id', clinicsController_1.getClinicById);
router.patch('/:id', clinicsController_1.updateClinic);
router.patch('/:id/photo', clinicsController_1.updateClinicPhoto);
router.delete('/:id', clinicsController_1.deleteClinic);
exports.default = router;
