import { enclosedCells, FLOOR_HEIGHT, type StructuralPiece } from './construction';
import { roomGroups } from './roof';

type Room = { y: number; cells: Set<string> };

export class ShelterIndex {
  private readonly surfaces = new Map<string, StructuralPiece[]>();
  private readonly rooms = new Map<string, Room[]>();

  refresh(pieces: readonly StructuralPiece[]) {
    this.surfaces.clear();
    this.rooms.clear();
    const elevations = new Set<number>();
    for (const piece of pieces) {
      if (piece.kind === 'roof' || piece.kind === 'floor') {
        const key = `${piece.x},${piece.z}`;
        const entries = this.surfaces.get(key) ?? [];
        entries.push(piece);
        this.surfaces.set(key, entries);
      }
      if (piece.kind === 'wall' || piece.kind === 'doorframe' || piece.kind === 'windowframe') elevations.add(piece.y);
    }
    for (const y of elevations) {
      const cells = enclosedCells(pieces, y);
      if (!cells) continue;
      for (const group of roomGroups(cells, pieces, y)) {
        const room = { y, cells: new Set(group.map(cell => `${cell.x},${cell.z}`)) };
        for (const key of room.cells) {
          const entries = this.rooms.get(key) ?? [];
          entries.push(room);
          this.rooms.set(key, entries);
        }
      }
    }
  }

  private key(x: number, z: number) {
    return `${Math.round(x / 2) * 2},${Math.round(z / 2) * 2}`;
  }

  roomAt(x: number, y: number, z: number): Room | undefined {
    return this.rooms.get(this.key(x, z))?.filter(room => y >= room.y - 0.1 && y < room.y + FLOOR_HEIGHT)
      .sort((a, b) => b.y - a.y)[0];
  }

  coverAt(x: number, y: number, z: number) {
    const pieces = this.surfaces.get(this.key(x, z)) ?? [];
    return pieces.some(piece => {
      let height = piece.kind === 'roof' ? piece.y + FLOOR_HEIGHT : piece.y;
      if (piece.roofShape) {
        const { axis, heights } = piece.roofShape;
        const offset = Math.max(-1, Math.min(1, axis === 0 ? x - piece.x : z - piece.z));
        height += offset < 0 ? heights[0] + (heights[1] - heights[0]) * (offset + 1)
          : heights[1] + (heights[2] - heights[1]) * offset;
      }
      return height > y + 0.05;
    });
  }

  status(x: number, y: number, z: number) {
    const covered = this.coverAt(x, y + 1.5, z);
    return this.roomAt(x, y, z) ? (covered ? 'sheltered' : 'open room') : (covered ? 'under cover' : 'outside');
  }
}
