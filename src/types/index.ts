// ==================== Database Types ====================

export interface Headline {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  source_type: 'custom' | 'news' | 'announcement' | null;
  source_id: string | null;
  source_slug?: string | null;
  content?: string | null;
  video_url?: string | null;
  youtube_url?: string | null;
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
  video_url?: string | null;
  youtube_url?: string | null;
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
  video_url?: string | null;
  youtube_url?: string | null;
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
  cover_image?: string | null;
  video_url?: string | null;
  youtube_url?: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface BoardMember {
  id: string;
  name: string;
  title: string | null;
  photo: string | null;
  slug?: string | null;
  bio?: string | null;
  phone?: string | null;
  email?: string | null;
  order: number;
  is_active: boolean;
  created_at: string;
}

export interface Branch {
  id: string;
  name: string;
  slug?: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  manager_id?: string | null;
  manager_name?: string | null;
  manager_title?: string | null;
  manager_photo?: string | null;
  manager_bio?: string | null;
  manager_phone?: string | null;
  manager_email?: string | null;
  map_url?: string | null;
  working_hours?: string | null;
  description?: string | null;
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

export interface ContentMedia {
  id: string;
  content_type: 'news' | 'announcement' | 'page' | 'headline' | 'quick_access';
  content_id: string;
  media_type: 'image' | 'video';
  url: string;
  order: number;
  created_at: string;
}

export interface HomepageSection {
  id: string;
  title: string;
  section_type: string;
  source: 'custom' | 'news' | 'announcements';
  item_count: number;
  layout: 'grid-4' | 'grid-8';
  order: number;
  is_active: boolean;
  created_at: string;
}

export interface HomepageSectionItem {
  id: string;
  section_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  order: number;
  is_active: boolean;
  created_at: string;
}

export interface NewsCategory {
  id: string;
  name: string;
  slug: string | null;
  order: number;
  is_active: boolean;
  created_at: string;
}

export interface QuickAccess {
  id: string;
  title: string;
  icon: string | null;
  image_url?: string | null;
  url: string;
  slug?: string | null;
  content?: string | null;
  video_url?: string | null;
  youtube_url?: string | null;
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
  slug: string;
  bio: string;
  phone: string;
  email: string;
  order: number;
  is_active: boolean;
}

export interface BranchFormData {
  name: string;
  slug: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  manager_id: string | null;
  manager_name: string;
  manager_title: string;
  manager_photo: string;
  manager_bio: string;
  manager_phone: string;
  manager_email: string;
  map_url: string;
  working_hours: string;
  description: string;
  is_active: boolean;
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
  image_url: string;
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
