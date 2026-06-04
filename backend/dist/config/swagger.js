"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.swaggerSpec = void 0;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const swaggerJsdoc = require('swagger-jsdoc');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'PetMi Vet API',
            version: '1.0.0',
            description: 'API para plataforma de conexão entre clínicas veterinárias e veterinários',
            contact: {
                name: 'PetMi Vet Support',
            },
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Servidor de desenvolvimento',
            },
            {
                url: 'https://petivet-api-staging.onrender.com',
                description: 'Servidor de staging',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        error: {
                            type: 'string',
                            description: 'Mensagem de erro',
                        },
                        statusCode: {
                            type: 'number',
                            description: 'Código de status HTTP',
                        },
                    },
                },
                Clinic: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            format: 'uuid',
                        },
                        name: {
                            type: 'string',
                        },
                        cnpj: {
                            type: 'string',
                        },
                        email: {
                            type: 'string',
                            format: 'email',
                        },
                        status: {
                            type: 'string',
                            enum: ['pending', 'active', 'inactive', 'suspended'],
                        },
                    },
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    apis: ['./src/routes/*.ts', './src/controllers/**/*.ts'],
};
exports.swaggerSpec = swaggerJsdoc(options);
