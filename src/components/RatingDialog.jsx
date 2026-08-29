import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  RATING_CATEGORIES,
  MAX_STARS,
  ratingsOf,
  ratingsToPlayerFields,
} from '@/modules/rating-dialog';

const NO_RATINGS = ratingsOf({});

export function RatingDialog({ isOpen, player, onClose, onSave }) {
  const [ratings, setRatings] = useState(NO_RATINGS);

  useEffect(() => {
    if (player) {
      setRatings(ratingsOf(player));
    }
  }, [player, isOpen]);

  if (!isOpen || !player) return null;

  const handleStarClick = (category, value) => {
    setRatings((prev) => ({
      ...prev,
      [category]: prev[category] === value ? 0 : value,
    }));
  };

  const handleClearAll = () => {
    setRatings(NO_RATINGS);
  };

  const handleSave = () => {
    onSave(ratingsToPlayerFields(ratings));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <dialog
        open
        className="rating-dialog relative z-50 grid w-full max-w-md gap-4 border bg-card p-6 shadow-xl rounded-lg text-foreground m-0"
        aria-labelledby="rating-dialog-title"
      >
        <div className="flex items-center justify-between border-b pb-3">
          <h2 id="rating-dialog-title" className="text-base font-semibold">
            Ratings: {player.name}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 rounded-sm opacity-70 hover:opacity-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 py-2">
          {RATING_CATEGORIES.map((category) => {
            const currentVal = ratings[category.key] || 0;
            return (
              <div
                key={category.key}
                className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
              >
                <span className="text-sm font-medium">{category.label}</span>
                <div
                  className="rating-stars flex items-center gap-1"
                  data-category={category.key}
                  role="group"
                  aria-label={`${category.label} rating for ${player.name}`}
                >
                  {[1, 2, 3, 4, 5].map((starValue) => {
                    const isFilled = starValue <= currentVal;
                    return (
                      <button
                        key={starValue}
                        type="button"
                        data-category={category.key}
                        data-value={starValue}
                        onClick={() => handleStarClick(category.key, starValue)}
                        className={cn(
                          "rating-star p-1 text-muted-foreground/30 hover:text-captain transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded",
                          isFilled && "filled text-captain fill-captain"
                        )}
                        aria-label={`${starValue} of ${MAX_STARS}, ${category.label}`}
                        aria-pressed={isFilled ? 'true' : 'false'}
                      >
                        <Star
                          className={cn(
                            "h-5 w-5",
                            isFilled ? "fill-captain text-captain" : "text-muted-foreground/40"
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rating-dialog-buttons flex flex-wrap gap-2 justify-between items-center pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            className="text-xs"
          >
            Clear All
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSave}
              className="text-xs"
            >
              Save
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
