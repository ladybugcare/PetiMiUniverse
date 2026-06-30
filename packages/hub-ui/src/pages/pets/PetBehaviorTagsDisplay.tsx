import React from 'react';
import { behaviorTagLabel, behaviorTagLevel } from './petBehaviorTags';

type Props = {
  tags: string[];
  className?: string;
};

export const PetBehaviorTagsDisplay: React.FC<Props> = ({ tags, className = '' }) => {
  if (!tags.length) return null;

  return (
    <div className={`hub-pets-behavior__display ${className}`.trim()}>
      {tags.map((tag) => {
        const level = behaviorTagLevel(tag);
        return (
          <span key={tag} className={`hub-pets-behavior__pill hub-pets-behavior__pill--${level}`}>
            {behaviorTagLabel(tag)}
          </span>
        );
      })}
    </div>
  );
};
