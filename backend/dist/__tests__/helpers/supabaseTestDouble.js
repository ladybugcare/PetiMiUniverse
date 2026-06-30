"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureSupabaseMock = configureSupabaseMock;
exports.getSupabaseModule = getSupabaseModule;
exports.getMockSupabaseClient = getMockSupabaseClient;
const mockSupabase_1 = require("./mockSupabase");
let client = (0, mockSupabase_1.createMockSupabaseClient)({ tables: {} });
function configureSupabaseMock(initial) {
    client = (0, mockSupabase_1.createMockSupabaseClient)(initial);
    return client;
}
function getSupabaseModule() {
    return {
        get supabase() {
            return client;
        },
        get supabaseAdmin() {
            return client;
        },
    };
}
function getMockSupabaseClient() {
    return client;
}
