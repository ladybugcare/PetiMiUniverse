"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const petsController_1 = require("../controllers/petsController");
const router = (0, express_1.Router)();
router.post('/register', petsController_1.createPet);
router.get('/', petsController_1.getPets);
exports.default = router;
