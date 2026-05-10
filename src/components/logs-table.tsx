import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Reading } from '@/lib/types';

interface LogsTableProps {
  readings: Reading[];
}

export function LogsTable({ readings }: LogsTableProps) {
  if (readings.length === 0) {
    return <p className="text-muted-foreground">No readings yet.</p>;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp</TableHead>
            <TableHead>Moisture</TableHead>
            <TableHead>Pump Fired</TableHead>
            <TableHead>Trigger</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {readings.map((reading) => (
            <TableRow key={reading.id}>
              <TableCell>
                {new Date(reading.created_at).toLocaleString('en-US', {
                  timeZone: 'Asia/Manila',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </TableCell>
              <TableCell>{reading.moisture}%</TableCell>
              <TableCell>
                {reading.pump_fired ? (
                  <Badge variant="default">Yes</Badge>
                ) : (
                  <Badge variant="secondary">No</Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={reading.trigger === 'auto' ? 'outline' : 'default'}>
                  {reading.trigger}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
