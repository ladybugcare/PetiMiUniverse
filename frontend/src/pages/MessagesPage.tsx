import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import ConversationList from '../components/ConversationList';
import ConversationThread from '../components/ConversationThread';
import { messagesApi, Conversation, Message } from '../services/messagesApi';
import { useAuth } from '../AuthContext';
import { getUserRole } from '../utils/authHelpers';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { useAlert } from '../hooks/useAlert';
import { ArrowLeft, Archive, ArchiveRestore, MessageSquare } from 'lucide-react';
import colors from '../styles/colors';
import Avatar from '../components/Avatar';

const MessagesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { showError, showSuccess } = useAlert();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [pendingDemandId, setPendingDemandId] = useState<string | null>(null);

  const userRole = user ? getUserRole(user) : 'UNKNOWN';
  
  // Get menu items using hook
  const { menuItems } = useSidebarMenu(userRole);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadConversations();
  }, [user, navigate]);

  // Abrir conversa se houver parâmetro na URL
  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    const demandId = searchParams.get('demand_id');
    
    // Armazenar demand_id se existir
    if (demandId) {
      setPendingDemandId(demandId);
    }
    
    if (conversationId && !selectedConversation) {
      // Primeiro, tentar encontrar na lista de conversas já carregadas
      const conversation = conversations.find(c => c.id === conversationId);
      if (conversation) {
        setSelectedConversation(conversation);
        // Remover parâmetros da URL após abrir (mas manter demand_id no estado)
        const newParams = new URLSearchParams();
        if (demandId) {
          newParams.set('demand_id', demandId);
        }
        setSearchParams(newParams);
      } else if (!loading && conversations.length >= 0) {
        // Se não encontrou na lista mas já terminou de carregar, buscar diretamente
        // (pode ser uma conversa recém-criada que ainda não está na lista)
        messagesApi.getConversation(conversationId)
          .then((result) => {
            if (result.conversation) {
              setSelectedConversation(result.conversation);
              // Remover conversation da URL mas manter demand_id se existir
              const newParams = new URLSearchParams();
              if (demandId) {
                newParams.set('demand_id', demandId);
              }
              setSearchParams(newParams);
            }
          })
          .catch((error) => {
            console.error('Error loading conversation from URL:', error);
            // Remover parâmetro mesmo se der erro
            const newParams = new URLSearchParams();
            if (demandId) {
              newParams.set('demand_id', demandId);
            }
            setSearchParams(newParams);
          });
      }
    }
  }, [conversations, loading, searchParams, selectedConversation, setSearchParams]);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const result = await messagesApi.getMyConversations();
      setConversations(result.conversations);
    } catch (error: any) {
      console.error('Error loading conversations:', error);
      showError('Erro ao carregar conversas: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      setLoadingMessages(true);
      const result = await messagesApi.getConversation(conversationId);
      setMessages(result.messages);
      
      // Marcar como lido
      await messagesApi.markAsRead(conversationId);
      
      // Atualizar lista de conversas para atualizar contagem de não lidas
      loadConversations();
    } catch (error: any) {
      console.error('Error loading messages:', error);
      showError('Erro ao carregar mensagens: ' + error.message);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!selectedConversation) return;
    
    try {
      // Incluir demand_id se houver um pendente (vindo da URL)
      const messageData: { message: string; demand_id?: string } = { message };
      if (pendingDemandId) {
        messageData.demand_id = pendingDemandId;
        // Limpar demand_id após usar (só usar na primeira mensagem)
        setPendingDemandId(null);
        // Remover da URL também
        setSearchParams({});
      }
      
      await messagesApi.sendMessage(selectedConversation.id, messageData);
      await loadMessages(selectedConversation.id);
      await loadConversations();
    } catch (error: any) {
      throw error;
    }
  };

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
  };

  const handleBack = () => {
    setSelectedConversation(null);
    setMessages([]);
  };

  const handleArchive = async (archive: boolean) => {
    if (!selectedConversation || !user) return;

    try {
      await messagesApi.archiveConversation(selectedConversation.id, archive);
      showSuccess(archive ? 'Conversa arquivada com sucesso!' : 'Conversa desarquivada com sucesso!');
      
      // Atualizar lista de conversas
      await loadConversations();
      
      // Se arquivou e está vendo conversas ativas, voltar para lista
      if (archive && !showArchived) {
        handleBack();
      } else {
        // Atualizar conversa selecionada
        const updatedConversations = await messagesApi.getMyConversations();
        const updatedConversation = updatedConversations.conversations.find(
          c => c.id === selectedConversation.id
        );
        if (updatedConversation) {
          setSelectedConversation(updatedConversation);
        }
      }
    } catch (error: any) {
      console.error('Error archiving conversation:', error);
      showError('Erro ao arquivar conversa: ' + (error.message || 'Erro desconhecido'));
    }
  };

  // Verificar se a conversa atual está arquivada pelo usuário
  const isArchivedByUser = selectedConversation && user ? (
    (selectedConversation.participant1_id === user.id && selectedConversation.archived_by_participant1) ||
    (selectedConversation.participant2_id === user.id && selectedConversation.archived_by_participant2)
  ) : false;


  // Se não há conversa selecionada, mostrar lista
  if (!selectedConversation) {
    return (
      <DashboardLayout pageName="Mensagens" menuItems={menuItems}>
        <div style={styles.container}>
          <div style={styles.header}>
            <h1 style={styles.title}>Mensagens</h1>
          </div>
          {loading ? (
            <div style={styles.loading}>Carregando conversas...</div>
          ) : (
            <div style={styles.listContainer}>
              <ConversationList
                conversations={conversations}
                onSelectConversation={handleSelectConversation}
                showArchived={showArchived}
                onToggleArchived={() => setShowArchived(!showArchived)}
              />
              <div style={styles.emptyRightPanel}>
                <MessageSquare size={64} color={colors.neutral[400]} />
                <p style={styles.emptyText}>Selecione uma conversa para começar</p>
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // Se há conversa selecionada, mostrar thread
  const otherParticipant = selectedConversation.other_participant;

  return (
    <DashboardLayout pageName="Mensagens" menuItems={menuItems}>
      <div style={styles.container}>
        <div style={styles.listContainer}>
          <ConversationList
            conversations={conversations}
            selectedConversationId={selectedConversation.id}
            onSelectConversation={handleSelectConversation}
            showArchived={showArchived}
            onToggleArchived={() => setShowArchived(!showArchived)}
          />
          
          <div style={styles.threadContainer}>
            {/* Header da conversa */}
            <div style={styles.threadHeader}>
              <button onClick={handleBack} style={styles.backButton}>
                <ArrowLeft size={20} />
              </button>
              <Avatar
                src={otherParticipant?.photo_url}
                name={otherParticipant?.name}
                size={40}
                userType={otherParticipant?.type}
              />
              <div style={styles.threadHeaderInfo}>
                <h3 style={styles.threadTitle}>{otherParticipant?.name || 'Usuário'}</h3>
                <span style={styles.threadSubtitle}>
                  {otherParticipant?.type === 'clinic' ? 'Clínica' : 
                   otherParticipant?.type === 'vet' ? 'Veterinário' : 
                   otherParticipant?.type === 'freelancer' ? 'Freelancer' :
                   otherParticipant?.type === 'admin' ? 'Administrador' : 'Usuário'}
                </span>
              </div>
              <button
                onClick={() => handleArchive(!isArchivedByUser)}
                style={styles.archiveHeaderButton}
                title={isArchivedByUser ? 'Desarquivar conversa' : 'Arquivar conversa'}
              >
                {isArchivedByUser ? (
                  <>
                    <ArchiveRestore size={18} />
                    <span>Desarquivar</span>
                  </>
                ) : (
                  <>
                    <Archive size={18} />
                    <span>Arquivar</span>
                  </>
                )}
              </button>
            </div>

            {/* Thread de mensagens */}
            {loadingMessages ? (
              <div style={styles.loading}>Carregando mensagens...</div>
            ) : (
              <ConversationThread
                messages={messages}
                currentUserId={user?.id || ''}
                otherParticipantName={otherParticipant?.name}
                otherParticipantPhoto={otherParticipant?.photo_url}
                otherParticipantType={otherParticipant?.type}
                onSendMessage={handleSendMessage}
              />
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100vh - 80px)',
    backgroundColor: '#f9fafb',
  },
  header: {
    padding: '24px',
    backgroundColor: '#ffffff',
    borderBottom: `1px solid ${colors.border}`,
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '28px',
    fontWeight: '600',
    color: colors.text,
    margin: 0,
  },
  loading: {
    padding: '48px',
    textAlign: 'center',
    fontSize: '16px',
    color: colors.textSecondary,
    fontFamily: 'Inter, sans-serif',
  },
  listContainer: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  emptyRightPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  emptyText: {
    marginTop: '16px',
    fontSize: '16px',
    color: colors.textSecondary,
    fontFamily: 'Inter, sans-serif',
  },
  threadContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#ffffff',
  },
  threadHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: '#ffffff',
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  threadHeaderInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  threadTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: colors.text,
    margin: 0,
  },
  threadSubtitle: {
    fontSize: '13px',
    color: colors.textSecondary,
    fontFamily: 'Inter, sans-serif',
  },
  archiveHeaderButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: 'Inter, sans-serif',
    color: colors.textSecondary,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

export default MessagesPage;

