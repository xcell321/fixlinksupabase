export interface ChatMessage {
  id: string;
  jobId: string;
  senderUid: string;
  senderName: string;
  senderRole: 'customer' | 'technician';
  text: string;
  timestamp: string;
  readBy?: string[];
  pending?: boolean;
}

export interface Conversation {
  jobId: string;
  jobCode?: string;
  peerUid?: string | null;
  peerPhone?: string | null;
  peerImage?: string | null;
  peerName: string;
  peerInitial: string;
  applianceType: string;
  status: string;
  roleLabel: string;
  unreadCount: number;
  lastMessage?: ChatMessage;
}
