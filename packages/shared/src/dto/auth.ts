export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserPublic;
}

export interface UserPublic {
  id: string;
  username: string;
  displayName: string | null;
  balance: string;
  role: 'PLAYER' | 'ADMIN';
  createdAt: string;
}

export interface RefreshRequest {
  refreshToken: string;
}
