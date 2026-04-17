export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserPublic;
}

export interface UserPublic {
  id: string;
  email: string;
  displayName: string | null;
  balance: string;
  role: 'PLAYER' | 'ADMIN';
  createdAt: string;
}

export interface RefreshRequest {
  refreshToken: string;
}
