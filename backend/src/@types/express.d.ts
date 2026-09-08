export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        corporateId?: string | null;
        email: string;
        name: string;
        departmentId?: string | null;
        roles: string[];
        permissions: string[];
      };
    }
  }
}
