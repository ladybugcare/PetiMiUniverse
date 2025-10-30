"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supabase_1 = require("../config/supabase");
const router = express_1.default.Router();
// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const { data, error } = await supabase_1.supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) {
            return res.status(401).json({ error: error.message });
        }
        res.json({
            user: data.user,
            session: data.session
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Signup
router.post('/signup', async (req, res) => {
    try {
        const { email, password, name, role } = req.body;
        const { data, error } = await supabase_1.supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name,
                    role,
                }
            }
        });
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        res.json({
            user: data.user,
            session: data.session
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
