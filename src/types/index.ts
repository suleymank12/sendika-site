// ==================== Database Types ====================

export interface Headline {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  source_type: 'custom' | 'news' | 'announcement' | null;
  source_id: string | null;
  order: number;
  is_active: boolean;
  created_at: string;
}

export interface MenuItem {
  id: string;
  title: string;
  url: string | null;
  parent_id: string | null;
  order: number;
  is_active: boolean;
  created_at: string;
  children?: MenuItem[];
}

export interface News {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string | null;
  cover_image: string | null;
  category: string | null;
  is_published: boolean;
  is_headline: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string | null;
  cover_image: string | null;
  is_published: boolean;
  is_headline: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Slider {
  id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string;
  link_url: string | null;
  order: number;
  is_active: boolean;
  created_at: string;
}

export interface Page {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface BoardMember {
  id: string;
  name: string;
  title: string | null;
  photo: string | null;
  order: number;
  is_active: boolean;
  created_at: string;
}

export interface Branch {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  order: number;
  created_at: string;
}

export interface GalleryAlbum {
  id: string;
  title: string;
  cover_image: string | null;
  order: number;
  is_published: boolean;
  created_at: string;
  images?: GalleryImage[];
}

export interface GalleryImage {
  id: string;
  album_id: string;
  image_url: string;
  caption: string | null;
  order: number;
  created_at: string;
}

export interface SiteSetting {
  id: string;
  key: string;
  value: string | null;
  updated_at: string;
}

export interface QuickAccess {
  id: string;
  title: string;
  icon: string | null;
  url: string;
  order: number;
  is_active: boolean;
  created_at: string;
}

// ==================== Form Types ====================

export interface HeadlineFormData {
  title: string;
  subtitle: string;
  image_url: string;
  link_url: string;
  source_type: 'custom' | 'news' | 'announcement';
  source_id: string | null;
  order: number;
  is_active: boolean;
}

export interface NewsFormData {
  title: string;
  summary: string;
  content: string;
  cover_image: string;
  category: string;
  is_published: boolean;
  is_headline: boolean;
}

export interface AnnouncementFormData {
  title: string;
  summary: string;
  content: string;
  cover_image: string;
  is_published: boolean;
  is_headline: boolean;
}

export interface SliderFormData {
  title: string;
  subtitle: string;
  image_url: string;
  link_url: string;
  order: number;
  is_active: boolean;
}

export interface PageFormData {
  title: string;
  content: string;
  is_published: boolean;
}

export interface BoardMemberFormData {
  name: string;
  title: string;
  photo: string;
  order: number;
  is_active: boolean;
}

export interface BranchFormData {
  name: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  is_active: boolean;
  order: number;
}

export interface MenuItemFormData {
  title: string;
  url: string;
  parent_id: string | null;
  order: number;
  is_active: boolean;
}

export interface QuickAccessFormData {
  title: string;
  icon: string;
  url: string;
  order: number;
  is_active: boolean;
}

// ==================== API Response Types ====================

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  code?: string;
}
