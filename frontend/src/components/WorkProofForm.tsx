import React, { useState, useEffect } from 'react';
import { LogIn, LogOut, FileText, CheckCircle, Loader, Upload, X } from 'lucide-react';
import { workProofApi, WorkProof } from '../services/workProofApi';
import { useAlert } from '../hooks/useAlert';
import colors from '../styles/colors';

interface WorkProofFormProps {
  applicationId: string;
  currentStatus: string;
  workProof?: WorkProof | null;
  onUpdate?: () => void;
}

const WorkProofForm: React.FC<WorkProofFormProps> = ({
  applicationId,
  currentStatus,
  workProof,
  onUpdate,
}) => {
  const { showSuccess, showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [reportText, setReportText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [newAttachment, setNewAttachment] = useState('');

  useEffect(() => {
    if (workProof) {
      setReportText(workProof.report_text || '');
      setAttachments(workProof.attachments || []);
    }
  }, [workProof]);

  const handleCheckIn = async () => {
    try {
      setLoading(true);
      // Tentar obter geolocalização (opcional)
      let location: { lat: number; lng: number } | undefined;
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5000,
            });
          });
          location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
        } catch (error) {
          // Geolocalização não disponível ou negada - continuar sem ela
          console.warn('Geolocalização não disponível:', error);
        }
      }

      await workProofApi.checkIn(applicationId, location);
      showSuccess('Check-in realizado com sucesso!');
      onUpdate?.();
    } catch (error: any) {
      showError('Erro ao fazer check-in: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    try {
      setLoading(true);
      // Tentar obter geolocalização (opcional)
      let location: { lat: number; lng: number } | undefined;
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5000,
            });
          });
          location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
        } catch (error) {
          // Geolocalização não disponível ou negada - continuar sem ela
          console.warn('Geolocalização não disponível:', error);
        }
      }

      await workProofApi.checkOut(applicationId, location);
      showSuccess('Check-out realizado com sucesso!');
      onUpdate?.();
    } catch (error: any) {
      showError('Erro ao fazer check-out: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAttachment = () => {
    if (newAttachment.trim()) {
      setAttachments([...attachments, newAttachment.trim()]);
      setNewAttachment('');
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleSubmitReport = async () => {
    if (!reportText.trim()) {
      showError('O relatório não pode estar vazio');
      return;
    }

    try {
      setLoading(true);
      await workProofApi.submitReport(applicationId, reportText, attachments);
      showSuccess('Relatório enviado com sucesso!');
      onUpdate?.();
    } catch (error: any) {
      showError('Erro ao enviar relatório: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Mostrar botão de check-in se status é 'approved'
  if (currentStatus === 'approved') {
    return (
      <div
        style={{
          padding: '16px',
          border: `1px solid ${colors.lightGray}`,
          borderRadius: '6px',
          backgroundColor: colors.background,
        }}
      >
        <button
          onClick={handleCheckIn}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: colors.primary,
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
            fontWeight: 500,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? (
            <>
              <Loader size={18} className="spin" />
              Processando...
            </>
          ) : (
            <>
              <LogIn size={18} />
              Fazer Check-in
            </>
          )}
        </button>
      </div>
    );
  }

  // Mostrar botão de check-out se status é 'check_in'
  if (currentStatus === 'check_in') {
    return (
      <div
        style={{
          padding: '16px',
          border: `1px solid ${colors.lightGray}`,
          borderRadius: '6px',
          backgroundColor: colors.background,
        }}
      >
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '0.875rem', color: colors.darkGray, marginBottom: '8px' }}>
            Check-in realizado em:{' '}
            {workProof?.checkin_time
              ? new Date(workProof.checkin_time).toLocaleString('pt-BR')
              : 'N/A'}
          </div>
        </div>
        <button
          onClick={handleCheckOut}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: colors.primary,
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
            fontWeight: 500,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? (
            <>
              <Loader size={18} className="spin" />
              Processando...
            </>
          ) : (
            <>
              <LogOut size={18} />
              Fazer Check-out
            </>
          )}
        </button>
      </div>
    );
  }

  // Mostrar formulário de relatório se status é 'check_out'
  if (currentStatus === 'check_out') {
    return (
      <div
        style={{
          padding: '16px',
          border: `1px solid ${colors.lightGray}`,
          borderRadius: '6px',
          backgroundColor: colors.background,
        }}
      >
        <h3
          style={{
            margin: '0 0 16px 0',
            fontSize: '1.1rem',
            color: colors.text,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <FileText size={20} />
          Enviar Relatório
        </h3>

        {workProof?.checkout_time && (
          <div style={{ marginBottom: '16px', fontSize: '0.875rem', color: colors.darkGray }}>
            Check-out realizado em: {new Date(workProof.checkout_time).toLocaleString('pt-BR')}
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '0.9rem',
              fontWeight: 500,
              color: colors.text,
            }}
          >
            Relatório *
          </label>
          <textarea
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder="Descreva o trabalho realizado, procedimentos realizados, observações importantes..."
            rows={6}
            style={{
              width: '100%',
              padding: '12px',
              border: `1px solid ${colors.lightGray}`,
              borderRadius: '6px',
              fontSize: '0.9rem',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '0.9rem',
              fontWeight: 500,
              color: colors.text,
            }}
          >
            Anexos (URLs)
          </label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="text"
              value={newAttachment}
              onChange={(e) => setNewAttachment(e.target.value)}
              placeholder="Cole a URL do arquivo (foto, PDF, etc.)"
              style={{
                flex: 1,
                padding: '8px 12px',
                border: `1px solid ${colors.lightGray}`,
                borderRadius: '6px',
                fontSize: '0.9rem',
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddAttachment();
                }
              }}
            />
            <button
              onClick={handleAddAttachment}
              style={{
                padding: '8px 16px',
                backgroundColor: colors.primary,
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Upload size={16} />
              Adicionar
            </button>
          </div>
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {attachments.map((url, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    backgroundColor: colors.lightGray,
                    borderRadius: '4px',
                    fontSize: '0.875rem',
                  }}
                >
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: colors.primary, textDecoration: 'none', flex: 1 }}
                  >
                    {url}
                  </a>
                  <button
                    onClick={() => handleRemoveAttachment(index)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      color: colors.danger,
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSubmitReport}
          disabled={loading || !reportText.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: colors.primary,
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: loading || !reportText.trim() ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
            fontWeight: 500,
            opacity: loading || !reportText.trim() ? 0.6 : 1,
          }}
        >
          {loading ? (
            <>
              <Loader size={18} className="spin" />
              Enviando...
            </>
          ) : (
            <>
              <FileText size={18} />
              Enviar Relatório
            </>
          )}
        </button>
      </div>
    );
  }

  // Mostrar visualização se relatório já foi enviado
  if (['report_sent', 'report_approved'].includes(currentStatus) && workProof) {
    return (
      <div
        style={{
          padding: '16px',
          border: `1px solid ${colors.lightGray}`,
          borderRadius: '6px',
          backgroundColor: colors.background,
        }}
      >
        <h3
          style={{
            margin: '0 0 16px 0',
            fontSize: '1.1rem',
            color: colors.text,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle size={20} color={colors.success} />
          Prova de Trabalho
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {workProof.checkin_time && (
            <div>
              <strong style={{ fontSize: '0.875rem', color: colors.text }}>Check-in:</strong>{' '}
              <span style={{ fontSize: '0.875rem', color: colors.darkGray }}>
                {new Date(workProof.checkin_time).toLocaleString('pt-BR')}
              </span>
            </div>
          )}

          {workProof.checkout_time && (
            <div>
              <strong style={{ fontSize: '0.875rem', color: colors.text }}>Check-out:</strong>{' '}
              <span style={{ fontSize: '0.875rem', color: colors.darkGray }}>
                {new Date(workProof.checkout_time).toLocaleString('pt-BR')}
              </span>
            </div>
          )}

          {workProof.report_text && (
            <div>
              <strong style={{ fontSize: '0.875rem', color: colors.text }}>Relatório:</strong>
              <div
                style={{
                  marginTop: '8px',
                  padding: '12px',
                  backgroundColor: colors.lightGray,
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  color: colors.text,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {workProof.report_text}
              </div>
            </div>
          )}

          {workProof.attachments && workProof.attachments.length > 0 && (
            <div>
              <strong style={{ fontSize: '0.875rem', color: colors.text }}>Anexos:</strong>
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {workProof.attachments.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '0.875rem',
                      color: colors.primary,
                      textDecoration: 'none',
                    }}
                  >
                    {url}
                  </a>
                ))}
              </div>
            </div>
          )}

          {currentStatus === 'report_approved' && workProof.clinic_signature && (
            <div style={{ marginTop: '8px', padding: '12px', backgroundColor: colors.success + '20', borderRadius: '4px' }}>
              <div style={{ fontSize: '0.875rem', color: colors.success, fontWeight: 500 }}>
                ✓ Relatório aprovado pela clínica
              </div>
              <div style={{ fontSize: '0.75rem', color: colors.darkGray, marginTop: '4px' }}>
                Aprovado em: {new Date(workProof.clinic_signature.signed_at).toLocaleString('pt-BR')}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default WorkProofForm;

