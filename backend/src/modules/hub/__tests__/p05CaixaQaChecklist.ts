/**
 * P0.5 — Checklist QA manual (Caixa / Financeiro)
 *
 * 1. Banho: PIX + cartão no mesmo ato; totais/restante corretos
 * 2. Dinheiro com troco estruturado; PDF e histórico; fechamento = só amount
 * 3. Venda rápida → checkout misto → comprovante
 * 4. Pacote leave_pending → não usável → quitar → usável
 * 5. Pacote 10, consumir 3 → cancel comercial → 7 mortos, 3 ok → preview refund → autorizar parcial
 * 6. Duplo clique / retry mesma key → 1 payment
 * 7. PIX com caixa fechado ok; cash sem sessão 409
 * 8. Bulk liquida leave_pending de pacote → balances active
 *
 * by_pet multi-split avançado fica fora deste P0.5 (1 método × grupos).
 */
export const P05_CAIXA_QA_CHECKLIST = [
  'mixed_pix_card_same_checkout',
  'cash_tendered_columns_pdf_history_close_sums_amount_only',
  'quick_sale_mixed_checkout_receipt',
  'package_leave_pending_then_pay_activates',
  'package_cancel_commercial_then_partial_refund',
  'idempotency_double_click_single_payment',
  'pix_without_session_ok_cash_without_session_409',
  'bulk_pay_activates_package_balances',
] as const;
