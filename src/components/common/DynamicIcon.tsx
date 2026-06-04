import React from 'react';
import * as LucideIcons from 'lucide-react';

export const DynamicIcon = ({ name, className, size = 16 }: { name: string, className?: string, size?: number }) => {
  if (!name) return null;
  const iconName = name.charAt(0).toUpperCase() + name.slice(1);
  const Icon = (LucideIcons as any)[iconName] || (LucideIcons as any)[name] || LucideIcons.Circle;
  return <Icon className={className} size={size} />;
};
