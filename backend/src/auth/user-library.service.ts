// backend/src/auth/user-library.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaType as DbMediaType } from '../generated/prisma';

type ApiMediaType = 'movie' | 'tv';

type FavoriteItem = { id: number; mediaType: ApiMediaType };

type PlaylistItemDto = { id: number; mediaType: ApiMediaType; addedAt: Date };
type PlaylistDto = {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  items: PlaylistItemDto[];
};

function toDbMediaType(mt: ApiMediaType): DbMediaType {
  // Prisma MediaType 타입은 내부적으로 'movie' | 'tv' 유니온이라 그대로 캐스팅 가능
  return mt === 'tv' ? DbMediaType.tv : DbMediaType.movie;
}

function toApiMediaType(mt: DbMediaType): ApiMediaType {
  return mt === DbMediaType.tv ? 'tv' : 'movie';
}

function normalizeFavoriteItems(items: FavoriteItem[]): FavoriteItem[] {
  const map = new Map<string, FavoriteItem>();

  for (const it of items) {
    const id = Number(it?.id);
    const mediaType: ApiMediaType = it?.mediaType === 'tv' ? 'tv' : 'movie';
    if (!Number.isFinite(id) || id <= 0) continue;

    const key = `${mediaType}:${id}`;
    if (!map.has(key)) map.set(key, { id, mediaType });
  }

  return Array.from(map.values());
}

@Injectable()
export class UserLibraryService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================
  // ✅ Favorites
  // =========================
  async getFavorites(userId: number): Promise<FavoriteItem[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { tmdbId: true, mediaType: true },
    });

    return rows.map((r) => ({
      id: r.tmdbId,
      mediaType: toApiMediaType(r.mediaType),
    }));
  }

  async setFavorite(
    userId: number,
    tmdbId: number,
    mediaType: ApiMediaType,
    isFavorite: boolean,
  ): Promise<void> {
    const id = Number(tmdbId);
    if (!Number.isFinite(id) || id <= 0) return;

    const mt = toDbMediaType(mediaType);

    if (isFavorite) {
      await this.prisma.favorite.upsert({
        where: {
          userId_tmdbId_mediaType: {
            userId,
            tmdbId: id,
            mediaType: mt,
          },
        },
        create: {
          userId,
          tmdbId: id,
          mediaType: mt,
        },
        update: {},
      });
      return;
    }

    // 찜 해제
    await this.prisma.favorite.deleteMany({
      where: { userId, tmdbId: id, mediaType: mt },
    });
  }

  async syncFavorites(
    userId: number,
    items: FavoriteItem[],
  ): Promise<FavoriteItem[]> {
    const normalized = normalizeFavoriteItems(items);

    await this.prisma.$transaction(async (tx) => {
      await tx.favorite.deleteMany({ where: { userId } });

      if (normalized.length > 0) {
        await tx.favorite.createMany({
          data: normalized.map((it) => ({
            userId,
            tmdbId: it.id,
            mediaType: toDbMediaType(it.mediaType),
          })),
          skipDuplicates: true,
        });
      }
    });

    return this.getFavorites(userId);
  }

  // =========================
  // ✅ Playlists
  // =========================
  async getPlaylists(userId: number): Promise<PlaylistDto[]> {
    const rows = await this.prisma.playlist.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        items: {
          orderBy: { addedAt: 'desc' },
          select: { tmdbId: true, mediaType: true, addedAt: true },
        },
      },
    });

    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      items: p.items.map((it) => ({
        id: it.tmdbId,
        mediaType: toApiMediaType(it.mediaType),
        addedAt: it.addedAt,
      })),
    }));
  }

  async createPlaylist(
    userId: number,
    name: string,
    items: FavoriteItem[],
  ): Promise<PlaylistDto> {
    const playlistName = (name ?? '').trim();
    const normalized = normalizeFavoriteItems(items);

    const created = await this.prisma.$transaction(async (tx) => {
      const pl = await tx.playlist.create({
        data: {
          userId,
          name: playlistName,
        },
        select: { id: true, name: true, createdAt: true, updatedAt: true },
      });

      if (normalized.length > 0) {
        await tx.playlistItem.createMany({
          data: normalized.map((it) => ({
            playlistId: pl.id,
            tmdbId: it.id,
            mediaType: toDbMediaType(it.mediaType),
          })),
          skipDuplicates: true,
        });
      }

      const full = await tx.playlist.findFirst({
        where: { id: pl.id, userId },
        include: {
          items: {
            orderBy: { addedAt: 'desc' },
            select: { tmdbId: true, mediaType: true, addedAt: true },
          },
        },
      });

      if (!full) throw new NotFoundException('playlist not found');
      return full;
    });

    return {
      id: created.id,
      name: created.name,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      items: created.items.map((it) => ({
        id: it.tmdbId,
        mediaType: toApiMediaType(it.mediaType),
        addedAt: it.addedAt,
      })),
    };
  }

  async deletePlaylist(userId: number, playlistId: number): Promise<void> {
    const pid = Number(playlistId);
    if (!Number.isFinite(pid) || pid <= 0) return;

    // userId 조건으로 보호
    const res = await this.prisma.playlist.deleteMany({
      where: { id: pid, userId },
    });

    if (res.count === 0) {
      throw new NotFoundException('playlist not found');
    }
  }

  async renamePlaylist(
    userId: number,
    playlistId: number,
    name: string,
  ): Promise<PlaylistDto> {
    const pid = Number(playlistId);
    const newName = (name ?? '').trim();

    const exists = await this.prisma.playlist.findFirst({
      where: { id: pid, userId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('playlist not found');

    const updated = await this.prisma.playlist.update({
      where: { id: pid },
      data: { name: newName },
      include: {
        items: {
          orderBy: { addedAt: 'desc' },
          select: { tmdbId: true, mediaType: true, addedAt: true },
        },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      items: updated.items.map((it) => ({
        id: it.tmdbId,
        mediaType: toApiMediaType(it.mediaType),
        addedAt: it.addedAt,
      })),
    };
  }

  async setPlaylistItems(
    userId: number,
    playlistId: number,
    items: FavoriteItem[],
  ): Promise<PlaylistDto> {
    const pid = Number(playlistId);
    if (!Number.isFinite(pid) || pid <= 0) {
      throw new NotFoundException('playlist not found');
    }

    const normalized = normalizeFavoriteItems(items);

    const updated = await this.prisma.$transaction(async (tx) => {
      const pl = await tx.playlist.findFirst({
        where: { id: pid, userId },
        select: { id: true },
      });
      if (!pl) throw new NotFoundException('playlist not found');

      await tx.playlistItem.deleteMany({ where: { playlistId: pid } });

      if (normalized.length > 0) {
        await tx.playlistItem.createMany({
          data: normalized.map((it) => ({
            playlistId: pid,
            tmdbId: it.id,
            mediaType: toDbMediaType(it.mediaType),
          })),
          skipDuplicates: true,
        });
      }

      // updatedAt 갱신을 확실히 하기 위해 touch
      await tx.playlist.update({
        where: { id: pid },
        data: { updatedAt: new Date() },
      });

      const full = await tx.playlist.findFirst({
        where: { id: pid, userId },
        include: {
          items: {
            orderBy: { addedAt: 'desc' },
            select: { tmdbId: true, mediaType: true, addedAt: true },
          },
        },
      });
      if (!full) throw new NotFoundException('playlist not found');
      return full;
    });

    return {
      id: updated.id,
      name: updated.name,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      items: updated.items.map((it) => ({
        id: it.tmdbId,
        mediaType: toApiMediaType(it.mediaType),
        addedAt: it.addedAt,
      })),
    };
  }
}
