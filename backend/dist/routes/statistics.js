"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const statisticsController_1 = require("../controllers/statisticsController");
const router = express_1.default.Router();
// Get clinic statistics
router.get('/clinic/:clinicId', statisticsController_1.getClinicStats);
// Get vet statistics
router.get('/vet/:vetId', statisticsController_1.getVetStats);
// Get system-wide statistics (admin only)
router.get('/system', statisticsController_1.getSystemStats);
exports.default = router;
