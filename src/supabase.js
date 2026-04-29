
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://avwvblebsscclhoepssj.supabase.co'

const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2d3ZibGVic3NjY2xob2Vwc3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MDM4MjQsImV4cCI6MjA5MzA3OTgyNH0.yG3wmIzs0bFKjDlBkS6-jLvobyUAF5inHZoFX0t3uV4'

export const supabase = createClient(supabaseUrl, supabaseKey)

