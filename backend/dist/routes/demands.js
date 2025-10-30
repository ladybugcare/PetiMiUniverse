"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const demandsController_1 = require("../controllers/demandsController");
const requireActiveClinic_1 = require("../middleware/requireActiveClinic");
const router = express_1.default.Router();
// Create demand (requires active clinic)
router.post('/create', requireActiveClinic_1.requireActiveClinic, demandsController_1.createDemand);
router.get('/open', demandsController_1.getDemands);
router.get('/all', demandsController_1.getAllDemands);
router.get('/recent-activity', demandsController_1.getRecentActivity);
router.get('/unit/:unitId', demandsController_1.getDemandsByUnit);
router.get('/:id', demandsController_1.getDemandById);
router.get('/:id/applications', demandsController_1.getDemandApplications);
router.patch('/:id', demandsController_1.updateDemand);
router.patch('/:id/status', demandsController_1.updateDemandStatus);
router.delete('/:id', demandsController_1.deleteDemand);
exports.default = router;
