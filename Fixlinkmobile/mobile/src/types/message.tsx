export interface ChatMessage {
  id: string;
  jobId: string;
  senderUid: string;
  senderName: string;
  senderRole: 'customer' | 'technician';
  // Empty string for an image-only message; render the photo on its own then.
  text: string;
  imageUrl?: string | null;
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
