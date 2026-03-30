// frontend/src/pages/detail/detailFavorites.context.ts
import React, { createContext, useContext } from "react";

export type DetailMediaType = "movie" | "tv";

export type FavoriteItem = {
  id: number;
  mediaType: DetailMediaType;
};

export type DetailFavoritesContextValue = {
  favorites: FavoriteItem[];
  isAuthed: boolean;
  toggleFavorite: (id: number, mediaType?: DetailMediaType) => void;
};

const DetailFavoritesContext =
  createContext<DetailFavoritesContextValue | null>(null);

type ProviderProps =
  | {
      children: React.ReactNode;
      value: DetailFavoritesContextValue;
    }
  | {
      children: React.ReactNode;
      favorites: FavoriteItem[];
      isAuthed: boolean;
      onToggleFavorite: (id: number, mediaType?: DetailMediaType) => void;
    };

export function DetailFavoritesProvider(props: ProviderProps) {
  const value: DetailFavoritesContextValue =
    "value" in props
      ? props.value
      : {
          favorites: props.favorites,
          isAuthed: props.isAuthed,
          toggleFavorite: props.onToggleFavorite,
        };

  return React.createElement(
    DetailFavoritesContext.Provider,
    { value },
    props.children
  );
}

export function useDetailFavorites(): DetailFavoritesContextValue {
  const v = useContext(DetailFavoritesContext);
  if (v) return v;

  return {
    favorites: [],
    isAuthed: false,
    toggleFavorite: () => {},
  };
}
