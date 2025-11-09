"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const specialtiesController_1 = require("../controllers/specialtiesController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Rota pública para listar especialidades
router.get('/', specialtiesController_1.getSpecialties);
// Rotas protegidas (apenas admin)
router.post('/', authMiddleware_1.authenticateUser, specialtiesController_1.createSpecialty);
router.put('/:id', authMiddleware_1.authenticateUser, specialtiesController_1.updateSpecialty);
router.delete('/:id', authMiddleware_1.authenticateUser, specialtiesController_1.deleteSpecialty);
exports.default = router;
