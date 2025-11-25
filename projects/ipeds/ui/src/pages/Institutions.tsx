import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'PR',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY',
];

const SECTORS: Record<number, string> = {
  1: 'Public, 4-year',
  2: 'Private nonprofit, 4-year',
  3: 'Private for-profit, 4-year',
  4: 'Public, 2-year',
  5: 'Private nonprofit, 2-year',
  6: 'Private for-profit, 2-year',
  7: 'Public, less than 2-year',
  8: 'Private nonprofit, less than 2-year',
  9: 'Private for-profit, less than 2-year',
};

export default function Institutions() {
  const [search, setSearch] = useState('');
  const [state, setState] = useState<string>('');
  const [sector, setSector] = useState<string>('');
  const [page, setPage] = useState(0);
  const limit = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['institutions', { search, state, sector, page }],
    queryFn: () =>
      api.getInstitutions({
        search: search || undefined,
        state: state || undefined,
        sector: sector ? parseInt(sector) : undefined,
        limit,
        offset: page * limit,
      }),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Institutions</h1>
        <p className="text-muted-foreground">
          Search and browse postsecondary institutions
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-4 flex-wrap">
        <Input
          placeholder="Search institutions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={state || 'all'} onValueChange={(v) => setState(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {US_STATES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sector || 'all'} onValueChange={(v) => setSector(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Sectors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sectors</SelectItem>
            {Object.entries(SECTORS).map(([code, name]) => (
              <SelectItem key={code} value={code}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit">Search</Button>
      </form>

      {data?.meta?.total !== undefined && (
        <p className="text-sm text-muted-foreground">
          Found {data.meta.total.toLocaleString()} institutions
        </p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>City</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Sector</TableHead>
              <TableHead>HBCU</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                </TableRow>
              ))
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No institutions found
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((inst) => (
                <TableRow key={inst.unitid}>
                  <TableCell>
                    <Link
                      to={`/institutions/${inst.unitid}`}
                      className="font-medium hover:underline"
                    >
                      {inst.name}
                    </Link>
                  </TableCell>
                  <TableCell>{inst.city}</TableCell>
                  <TableCell>{inst.state}</TableCell>
                  <TableCell className="text-sm">
                    {SECTORS[inst.sector] || `Sector ${inst.sector}`}
                  </TableCell>
                  <TableCell>{inst.hbcu ? 'Yes' : ''}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          onClick={() => setPage(page + 1)}
          disabled={!data?.data || data.data.length < limit}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
