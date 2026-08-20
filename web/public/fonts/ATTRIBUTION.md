# Sloan.otf

The Sloan optotype font, from Denis Pelli's Eye-Chart-Fonts project
(<https://github.com/denispelli/Eye-Chart-Fonts>), released for free use.

It is used unmodified. Sloan letters (C D H K N O R S V Z) are the standard
optotype set for acuity measurement: each is drawn on the 5x5 grid the sizing
maths in `backend/acuity.py` assumes, and the ten are matched for legibility so
no letter is easier than another. A general-purpose typeface would invalidate
both properties, which is why the real chart font is shipped rather than
approximated.
