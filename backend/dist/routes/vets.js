"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const vetsController_1 = require("../controllers/vetsController");
const router = express_1.default.Router();
router.post('/register', vetsController_1.createVet);
router.get('/', vetsController_1.getVets);
router.get('/check-email/:email', vetsController_1.checkEmail);
router.get('/:id', vetsController_1.getVetById);
router.patch('/:id', vetsController_1.updateVet);
router.patch('/:id/photo', vetsController_1.updateVetPhoto);
router.patch('/:id/status', vetsController_1.updateVetStatus);
router.delete('/:id', vetsController_1.deleteVet);
exports.default = router;
